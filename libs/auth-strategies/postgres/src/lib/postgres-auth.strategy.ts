import postgres from 'postgres';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { RpcException } from '@nestjs/microservices';
import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  VerifiedToken,
} from '@icore/shared';
import { decideRefresh, hashRefreshToken } from './refresh-token';

export interface PostgresAuthStrategyOptions {
  url: string;
  jwtSecret: string;
  jwtExpiresIn?: string;
  refreshExpiresIn?: string;
}

function parseDurationSeconds(s: string): number {
  const m = /^(\d+)(s|m|h|d)$/.exec(s);
  if (!m) return 900;
  const n = parseInt(m[1] as string, 10);
  const unit = m[2] as string;
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  return n * 86400;
}

function parseDurationMs(s: string): number {
  return parseDurationSeconds(s) * 1000;
}

export class PostgresAuthStrategy implements AuthStrategy {
  private readonly sql: postgres.Sql;
  private tablesReadyPromise: Promise<void> | null = null;

  constructor(private readonly opts: PostgresAuthStrategyOptions) {
    this.sql = postgres(opts.url);
  }

  private ensureTables(): Promise<void> {
    if (!this.tablesReadyPromise) {
      this.tablesReadyPromise = this._createTables();
    }
    return this.tablesReadyPromise;
  }

  private async _createTables(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS _icore_users (
        id             TEXT PRIMARY KEY,
        email          TEXT UNIQUE NOT NULL,
        password_hash  TEXT,
        role           TEXT,
        last_logged_in TIMESTAMPTZ,
        created_at     TIMESTAMPTZ DEFAULT now()
      )
    `;
    await this.sql`
      CREATE TABLE IF NOT EXISTS _icore_sessions (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL,
        family_id      TEXT NOT NULL,
        token_hash     TEXT UNIQUE NOT NULL,
        revoked_at     TIMESTAMPTZ,
        expires_at     TIMESTAMPTZ NOT NULL
      )
    `;
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    try {
      const decoded = jwt.verify(token, this.opts.jwtSecret) as jwt.JwtPayload;
      return {
        uid: decoded.sub as string,
        email: decoded['email'] as string,
        role: decoded['role'] as string,
      };
    } catch {
      throw new RpcException('invalid_token');
    }
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    await this.ensureTables();
    const rows = await this.sql<
      { id: string; email: string; password_hash: string; role: string | null }[]
    >`
      SELECT id, email, password_hash, role FROM _icore_users WHERE email = ${email}
    `;
    const user = rows[0];
    if (!user || !user.password_hash) throw new RpcException('invalid_credentials');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new RpcException('invalid_credentials');
    await this.sql`
      UPDATE _icore_users SET last_logged_in = now() WHERE id = ${user.id}
    `;
    return this.createSession({ id: user.id, email: user.email, role: user.role ?? undefined });
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    await this.ensureTables();
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      await this.sql`
        INSERT INTO _icore_users (id, email, password_hash) VALUES (${id}, ${email}, ${passwordHash})
      `;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        throw new RpcException('user_already_exists');
      }
      throw err;
    }
    return this.createSession({ id, email });
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    await this.ensureTables();
    const tokenHash = hashRefreshToken(refreshToken);
    const sessions = await this.sql<
      {
        id: string;
        user_id: string;
        family_id: string;
        revoked_at: Date | null;
        expires_at: Date;
      }[]
    >`
      SELECT id, user_id, family_id, revoked_at, expires_at FROM _icore_sessions WHERE token_hash = ${tokenHash}
    `;
    const session = sessions[0];
    const decision = decideRefresh(
      session ? { revokedAt: session.revoked_at, expiresAt: session.expires_at } : undefined,
      new Date(),
    );

    if (decision.kind === 'reuse_detected') {
      // The token was already rotated out — someone is replaying a stolen
      // refresh token. Revoke the whole lineage, not just this row.
      await this
        .sql`DELETE FROM _icore_sessions WHERE family_id = ${(session as { family_id: string }).family_id}`;
      throw new RpcException('invalid_refresh_token');
    }
    if (decision.kind === 'expired') {
      await this.sql`DELETE FROM _icore_sessions WHERE id = ${(session as { id: string }).id}`;
      throw new RpcException('invalid_refresh_token');
    }
    if (decision.kind === 'not_found') {
      throw new RpcException('invalid_refresh_token');
    }

    const current = session as { id: string; user_id: string; family_id: string };
    const users = await this.sql<{ id: string; email: string; role: string | null }[]>`
      SELECT id, email, role FROM _icore_users WHERE id = ${current.user_id}
    `;
    const user = users[0];
    if (!user) throw new RpcException('user_not_found');
    await this.sql`UPDATE _icore_sessions SET revoked_at = now() WHERE id = ${current.id}`;
    await this.sql`
      UPDATE _icore_users SET last_logged_in = now() WHERE id = ${user.id}
    `;
    return this.createSession(
      { id: user.id, email: user.email, role: user.role ?? undefined },
      current.family_id,
    );
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.ensureTables();
    const tokenHash = hashRefreshToken(refreshToken);
    await this.sql`DELETE FROM _icore_sessions WHERE token_hash = ${tokenHash}`;
  }

  async setRole(uid: string, role: string): Promise<void> {
    await this.ensureTables();
    await this.sql`UPDATE _icore_users SET role = ${role} WHERE id = ${uid}`;
  }

  async getRole(uid: string): Promise<string | null> {
    await this.ensureTables();
    const rows = await this.sql<{ role: string | null }[]>`
      SELECT role FROM _icore_users WHERE id = ${uid}
    `;
    return rows[0]?.role ?? null;
  }

  async sendMagicLink(_req: MagicLinkRequest): Promise<void> {
    throw new Error('not_implemented');
  }

  async verifyMagicLink(_token: string): Promise<AuthSession> {
    throw new Error('not_implemented');
  }

  async startOAuth(_provider: OAuthProvider, _callbackUrl: string): Promise<OAuthStartResult> {
    throw new Error('not_implemented');
  }

  async completeOAuth(
    _provider: OAuthProvider,
    _code: string,
    _state: string,
  ): Promise<AuthSession> {
    throw new Error('not_implemented');
  }

  private async createSession(
    user: {
      id: string;
      email: string;
      role?: string;
    },
    familyId?: string,
  ): Promise<AuthSession> {
    const expiresIn = this.opts.jwtExpiresIn ?? '15m';
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.opts.jwtSecret,
      { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] },
    );
    const refreshToken = randomUUID();
    const tokenHash = hashRefreshToken(refreshToken);
    const refreshMs = parseDurationMs(this.opts.refreshExpiresIn ?? '7d');
    const expiresAt = new Date(Date.now() + refreshMs);
    await this.sql`
      INSERT INTO _icore_sessions (id, user_id, family_id, token_hash, expires_at)
      VALUES (${randomUUID()}, ${user.id}, ${familyId ?? randomUUID()}, ${tokenHash}, ${expiresAt})
    `;
    return {
      accessToken,
      refreshToken,
      expiresIn: parseDurationSeconds(expiresIn),
      user: { id: user.id, email: user.email },
    };
  }

  async end(): Promise<void> {
    await this.sql.end();
  }
}
