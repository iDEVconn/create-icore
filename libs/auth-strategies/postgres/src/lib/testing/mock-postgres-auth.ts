import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  VerifiedToken,
} from '@icore/shared';

const MOCK_JWT_SECRET = 'mock-test-secret';

export function createMockPostgresAuth(): AuthStrategy {
  const users = new Map<
    string,
    { id: string; email: string; passwordHash: string; role?: string }
  >();
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();

  function buildSession(user: { id: string; email: string; role?: string }): AuthSession {
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      MOCK_JWT_SECRET,
      { expiresIn: '1h' },
    );
    const refreshToken = randomUUID();
    sessions.set(refreshToken, {
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
    });
    return { accessToken, refreshToken, expiresIn: 3600, user: { id: user.id, email: user.email } };
  }

  return {
    async signUp(email: string, password: string): Promise<AuthSession> {
      if ([...users.values()].find((u) => u.email === email)) {
        throw new Error('user_already_exists');
      }
      const id = randomUUID();
      const passwordHash = await bcrypt.hash(password, 10);
      users.set(id, { id, email, passwordHash });
      return buildSession({ id, email });
    },

    async signIn(email: string, password: string): Promise<AuthSession> {
      const user = [...users.values()].find((u) => u.email === email);
      if (!user) throw new Error('invalid_credentials');
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) throw new Error('invalid_credentials');
      return buildSession(user);
    },

    async verifyToken(token: string): Promise<VerifiedToken> {
      try {
        const decoded = jwt.verify(token, MOCK_JWT_SECRET) as jwt.JwtPayload;
        return {
          uid: decoded.sub as string,
          email: decoded['email'] as string,
          role: decoded['role'] as string,
        };
      } catch (err) {
        throw new Error('invalid_token', { cause: err });
      }
    },

    async refresh(refreshToken: string): Promise<AuthSession> {
      const session = sessions.get(refreshToken);
      if (!session || session.expiresAt < new Date()) {
        sessions.delete(refreshToken);
        throw new Error('invalid_refresh_token');
      }
      const user = users.get(session.userId);
      if (!user) throw new Error('user_not_found');
      sessions.delete(refreshToken);
      return buildSession(user);
    },

    async setRole(uid: string, role: string): Promise<void> {
      const user = users.get(uid);
      if (user) user.role = role;
    },

    async getRole(uid: string): Promise<string | null> {
      return users.get(uid)?.role ?? null;
    },

    async sendMagicLink(_req: MagicLinkRequest): Promise<void> {
      throw new Error('not_implemented');
    },
    async verifyMagicLink(_token: string): Promise<AuthSession> {
      throw new Error('not_implemented');
    },
    async startOAuth(_provider: OAuthProvider, _callbackUrl: string): Promise<OAuthStartResult> {
      throw new Error('not_implemented');
    },
    async completeOAuth(
      _provider: OAuthProvider,
      _code: string,
      _state: string,
    ): Promise<AuthSession> {
      throw new Error('not_implemented');
    },
  };
}
