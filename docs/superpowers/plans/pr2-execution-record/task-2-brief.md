### Task 2: `PostgresAuthStrategy` domain errors survive the TCP hop as `RpcException`

**Files:**
- Modify: `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts:72-83,85-100,102-122,124-146`
- Modify: `libs/auth-strategies/postgres/package.json`
- Modify: `libs/auth-client/src/lib/auth-client.service.ts`
- Create: `libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.strategy.unit.test.ts`

**Interfaces:**
- Consumes: `RpcException` from `@nestjs/microservices` (already a dependency of `auth-client`; needs adding to `auth-postgres`).
- Produces: `mapRpcErrors<T>(promise: Promise<T>): Promise<T>` (new private helper in `auth-client.service.ts`) — used internally by `login`, `signup`, `refresh`; not exported.

**Root cause:** `PostgresAuthStrategy` throws plain `Error('invalid_credentials')`, `Error('user_already_exists')`, etc. Nest's `BaseRpcExceptionFilter` on the MS side serializes an unrecognized thrown value as a generic RPC error; by the time it crosses the TCP boundary and lands in the gateway's `firstValueFrom()` rejection, the original message is gone — every failure looks like the same opaque 500, so a duplicate-signup and a wrong-password both surface identically to the client.

- [ ] **Step 1: Write the failing test — strategy throws RpcException with the original message**

```typescript
// libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.strategy.unit.test.ts
import { describe, expect, it } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { createMockPostgresAuth } from '../testing/mock-postgres-auth';

// createMockPostgresAuth is the in-memory double used by the contract suite;
// it mirrors PostgresAuthStrategy's control flow closely enough to exercise
// the same domain-error branches without a real Postgres connection. The
// actual RpcException conversion under test lives in postgres-auth.strategy.ts
// itself — see the module-level contract test for the full round-trip.

describe('PostgresAuthStrategy — RPC error propagation', () => {
  it('signIn with wrong password rejects with invalid_credentials', async () => {
    const strategy = createMockPostgresAuth();
    await strategy.signUp('x@x.com', 'right-pw12345');
    await expect(strategy.signIn('x@x.com', 'wrong-pw12345')).rejects.toThrow(
      'invalid_credentials',
    );
  });

  it('signUp with a duplicate email rejects with user_already_exists', async () => {
    const strategy = createMockPostgresAuth();
    await strategy.signUp('dup@x.com', 'pw12345!');
    await expect(strategy.signUp('dup@x.com', 'pw12345!')).rejects.toThrow('user_already_exists');
  });

  it('refresh with an unknown token rejects with invalid_refresh_token', async () => {
    const strategy = createMockPostgresAuth();
    await expect(strategy.refresh('not-a-real-token')).rejects.toThrow('invalid_refresh_token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test auth-postgres -- postgres-auth.strategy.unit.test.ts`
Expected: PASS already for the mock double (it throws plain `Error` with these messages, and `.rejects.toThrow(message)` matches on message regardless of `Error` vs `RpcException`) — this test is a baseline, not the regression proof. The regression proof is Step 3's assertion that the error is an `RpcException` instance, added next.

- [ ] **Step 2b: Extend the test to assert the exception type**

```typescript
  it('domain errors from the real strategy are RpcException instances (survive the TCP hop with their message intact)', async () => {
    // RpcException is what Nest's BaseRpcExceptionFilter forwards verbatim;
    // a plain Error gets collapsed into a generic RPC error by the filter,
    // losing the distinction between invalid_credentials/user_already_exists/etc.
    const { PostgresAuthStrategy } = await import('../postgres-auth.strategy');
    const strategy = new PostgresAuthStrategy({
      url: 'postgres://invalid-host-never-resolves/db',
      jwtSecret: 'test-secret',
    });
    await expect(strategy.verifyToken('not-a-jwt')).rejects.toBeInstanceOf(RpcException);
  });
```

Run: `npx nx test auth-postgres -- postgres-auth.strategy.unit.test.ts`
Expected: FAIL — `verifyToken` currently throws plain `Error('invalid_token', { cause: err })`.

- [ ] **Step 3: Convert domain errors to `RpcException` in the strategy**

```typescript
// libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts
// Add the import:
import { RpcException } from '@nestjs/microservices';

// verifyToken — replace the catch:
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

// signIn — replace both throws:
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

// signUp — replace the duplicate-email throw:
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

// refresh — replace both throws:
  async refresh(refreshToken: string): Promise<AuthSession> {
    await this.ensureTables();
    const sessions = await this.sql<{ id: string; user_id: string; expires_at: Date }[]>`
      SELECT id, user_id, expires_at FROM _icore_sessions WHERE refresh_token = ${refreshToken}
    `;
    const session = sessions[0];
    if (!session || session.expires_at < new Date()) {
      if (session) {
        await this.sql`DELETE FROM _icore_sessions WHERE id = ${session.id}`;
      }
      throw new RpcException('invalid_refresh_token');
    }
    const users = await this.sql<{ id: string; email: string; role: string | null }[]>`
      SELECT id, email, role FROM _icore_users WHERE id = ${session.user_id}
    `;
    const user = users[0];
    if (!user) throw new RpcException('user_not_found');
    await this.sql`DELETE FROM _icore_sessions WHERE id = ${session.id}`;
    await this.sql`
      UPDATE _icore_users SET last_logged_in = now() WHERE id = ${user.id}
    `;
    return this.createSession({ id: user.id, email: user.email, role: user.role ?? undefined });
  }
```

- [ ] **Step 4: Add `@nestjs/microservices` to the strategy's package.json**

```json
{
  "name": "@icore/auth-postgres",
  "version": "0.0.1",
  "private": true,
  "type": "commonjs",
  "main": "./src/index.js",
  "types": "./src/index.ts",
  "dependencies": {
    "@icore/shared": "*",
    "@nestjs/common": "^11.1.27",
    "@nestjs/config": "^4.0.4",
    "@nestjs/microservices": "^11.1.27",
    "bcrypt": "^6.0.0",
    "jsonwebtoken": "^9.0.3",
    "postgres": "^3.4.5",
    "tslib": "^2.8.1"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.1.27",
    "@types/bcrypt": "^6.0.0",
    "@types/jsonwebtoken": "^9.0.10",
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test auth-postgres`
Expected: PASS — including the pre-existing `postgres-auth.contract.unit.test.ts` (it asserts on `.rejects.toThrow()` without checking exception type, so it's unaffected by the `Error` → `RpcException` swap).

- [ ] **Step 6: Map known RPC error messages to HTTP exceptions in the gateway's client**

```typescript
// libs/auth-client/src/lib/auth-client.service.ts
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { AuthSession, OAuthProvider, OAuthStartResult, VerifiedToken } from '@icore/shared';
import { AUTH_CLIENT } from './auth-client.tokens';

const RPC_ERROR_MAP: Record<string, new (message: string) => Error> = {
  user_already_exists: ConflictException,
  invalid_credentials: UnauthorizedException,
  invalid_refresh_token: UnauthorizedException,
  user_not_found: UnauthorizedException,
};

function rpcMessage(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return undefined;
}

async function mapRpcErrors<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    const message = rpcMessage(err);
    const ExceptionCtor = message ? RPC_ERROR_MAP[message] : undefined;
    if (ExceptionCtor) throw new ExceptionCtor(message as string);
    throw err;
  }
}

@Injectable()
export class AuthClientService {
  constructor(@Inject(AUTH_CLIENT) private readonly client: ClientProxy) {}

  verify(token: string): Promise<VerifiedToken> {
    return firstValueFrom(this.client.send<VerifiedToken>('auth.verify', { token }));
  }

  login(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.client.send<AuthSession>('auth.login', { email, password })),
    );
  }

  signup(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.client.send<AuthSession>('auth.signup', { email, password })),
    );
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.client.send<AuthSession>('auth.refresh', { refreshToken })),
    );
  }

  async setRole(uid: string, role: string): Promise<void> {
    await firstValueFrom(this.client.send<{ ok: true }>('auth.setRole', { uid, role }));
  }

  async sendMagicLink(email: string, callbackUrl: string): Promise<void> {
    await firstValueFrom(
      this.client.send<{ ok: true }>('auth.magicLink.send', { email, callbackUrl }),
    );
  }

  verifyMagicLink(token: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.magicLink.verify', { token }));
  }

  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    return firstValueFrom(
      this.client.send<OAuthStartResult>('auth.oauth.start', { provider, callbackUrl }),
    );
  }

  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    return firstValueFrom(
      this.client.send<AuthSession>('auth.oauth.complete', { provider, code, state }),
    );
  }
}
```

- [ ] **Step 7: Add mapping regression tests**

```typescript
// libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
// Add alongside the Task 1 tests in the same file:
import { throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

describe('AuthClientService — RPC error mapping', () => {
  it('maps user_already_exists to ConflictException', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('user_already_exists')));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.signup('a@x.com', 'pw12345!')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps invalid_credentials to UnauthorizedException', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('invalid_credentials')));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.login('a@x.com', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('passes through unrecognized RPC errors unchanged', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('some_unmapped_error')));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.login('a@x.com', 'pw')).rejects.not.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx nx test auth-client`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
npx prettier --write libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts libs/auth-strategies/postgres/package.json libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.strategy.unit.test.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
npx nx lint auth-postgres
npx nx lint auth-client
git add libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts libs/auth-strategies/postgres/package.json libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.strategy.unit.test.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
git commit -m "fix(auth): convert postgres strategy domain errors to RpcException, map to HTTP exceptions at the gateway"
```

---

