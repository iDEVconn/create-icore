# PR3: Auth MS security — HMAC transport guard + session revocation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two security/auth gaps in the generated auth MS: (1) the auth MS's TCP port has zero transport-level authentication — any process that can reach it can call `auth.setRole({ uid, role: 'admin' })` directly, bypassing the gateway's CASL checks entirely and self-granting admin on any account; (2) no `AuthStrategy` implementation can invalidate a refresh token — once issued, a session lives until its natural expiry with no logout path, so a stolen or leaked refresh token (or a shared-machine logout) can't actually be revoked.

**Architecture:** Gap 1: an opt-in shared-secret HMAC layer — `AuthClientService` signs every outgoing payload when `AUTH_TCP_SECRET` is configured; a global `APP_GUARD` on the auth MS verifies the signature and strips it before the handler sees the payload. No-op (open, exactly like today) when the secret isn't configured, so this doesn't change behavior for anyone who doesn't opt in. Gap 2: add `revoke(refreshToken): Promise<void>` to the `AuthStrategy` interface, implement it for the session-table-backed strategies (`postgres`, `mongodb`, `FakeAuthStrategy`), wire an `auth.revoke` message pattern + gateway `POST /auth/logout` route.

**Tech Stack:** NestJS microservices (`APP_GUARD`, `RpcException`), `node:crypto` HMAC-SHA256, Vitest.

## Global Constraints

- Nx monorepo — run tests via `nx test <project>`.
- TDD: failing test first.
- `npx prettier --write <touched files>` before every commit.
- `nx lint <project>` 0 errors, `nx build <project>` green before commit.
- Every PR needs a `.changeset/<slug>.md`, `patch` bump.
- Branch: `feature/auth-ms-hmac-and-revoke` cut from `dev`. PR base `dev`.
- This plan builds on top of PR2 (`bug/auth-rpc-boundary-hygiene`) — `auth-client.service.ts` already has `mapRpcErrors`/`RPC_ERROR_MAP` and `setRole`/`sendMagicLink` returning `{ ok: true }` internally by the time this plan's edits land. If PR2 hasn't merged yet, rebase this branch on it first.
- Touched projects: `shared` (lib), `auth` (MS), `auth-client` (lib), `auth-postgres` (lib), `api` (gateway). All file paths in this plan are repo-root source (`apps/`, `libs/`) — the source of truth. `tools/create-icore/templates/` is a gitignored build artifact regenerated from these paths by `snapshot-templates.mjs`; never edit it directly.

---

### Task 1: HMAC transport guard on the auth MS

**Files:**
- Create: `libs/shared/src/security/hmac.ts`
- Create: `libs/shared/src/security/__tests__/hmac.unit.test.ts`
- Modify: `libs/shared/src/index.ts`
- Create: `apps/microservices/auth/src/app/security/hmac.guard.ts`
- Create: `apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts`
- Modify: `apps/microservices/auth/src/app/app.module.ts`
- Modify: `libs/auth-client/src/lib/auth-client.service.ts`
- Modify: `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`
- Modify: `apps/microservices/auth/.env.example`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `signHmac(payload: unknown, secret: string): string` and `verifyHmac(payload: unknown, signature: string, secret: string): boolean`, exported from `@icore/shared`.

**Root cause:** `apps/microservices/auth/src/app/app.module.ts` registers zero guards. Any process on the same network that can open a TCP connection to `AUTH_PORT` can send a raw NestJS microservice message directly — `auth.setRole({ uid: '<any-uid>', role: 'admin' })` — bypassing the gateway's `AuthGuard` + CASL `@CheckAbility` entirely and self-granting admin on any account. The fix is opt-in (activated by setting the same `AUTH_TCP_SECRET` on both the gateway and the auth MS) so it doesn't break existing deployments that haven't configured it, but closes the hole the moment it's set.

- [ ] **Step 1: Write the failing test for the HMAC helper**

```typescript
// libs/shared/src/security/__tests__/hmac.unit.test.ts
import { describe, expect, it } from 'vitest';
import { signHmac, verifyHmac } from '../hmac';

describe('signHmac / verifyHmac', () => {
  it('verifies a signature produced by signHmac for the same payload + secret', () => {
    const payload = { uid: 'u1', role: 'admin' };
    const sig = signHmac(payload, 'shared-secret');
    expect(verifyHmac(payload, sig, 'shared-secret')).toBe(true);
  });

  it('rejects a signature produced with a different secret', () => {
    const payload = { uid: 'u1', role: 'admin' };
    const sig = signHmac(payload, 'secret-a');
    expect(verifyHmac(payload, sig, 'secret-b')).toBe(false);
  });

  it('rejects a signature when the payload has been tampered with', () => {
    const sig = signHmac({ uid: 'u1', role: 'user' }, 'shared-secret');
    expect(verifyHmac({ uid: 'u1', role: 'admin' }, sig, 'shared-secret')).toBe(false);
  });

  it('rejects a malformed/non-hex signature without throwing', () => {
    expect(verifyHmac({ uid: 'u1' }, 'not-valid-hex-!!', 'shared-secret')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test shared -- hmac.unit.test.ts`
Expected: FAIL — module `../hmac` doesn't exist yet.

- [ ] **Step 3: Implement the HMAC helper**

```typescript
// libs/shared/src/security/hmac.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Deterministic HMAC-SHA256 signature over a JSON-stable payload. */
export function signHmac(payload: unknown, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export function verifyHmac(payload: unknown, signature: string, secret: string): boolean {
  const expected = Buffer.from(signHmac(payload, secret), 'hex');
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
```

```typescript
// libs/shared/src/index.ts
export * from './env';
export * from './bootstrap';
export * from './abilities';
export * from './jobs';
export * from './strategies';
export * from './transport';
export * from './types';
export * from './security/hmac';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test shared -- hmac.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the MS guard**

```typescript
// apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { signHmac } from '@icore/shared';
import { HmacAuthGuard } from '../hmac.guard';

function makeContext(data: Record<string, unknown>): ExecutionContext {
  return {
    switchToRpc: () => ({ getData: () => data }),
  } as unknown as ExecutionContext;
}

describe('HmacAuthGuard', () => {
  const ORIGINAL_ENV = { ...process.env };
  const guard = new HmacAuthGuard();

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('allows any request through (with a warning) when AUTH_TCP_SECRET is not configured outside production', () => {
    delete process.env['AUTH_TCP_SECRET'];
    delete process.env['NODE_ENV'];
    const ctx = makeContext({ uid: 'u1' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws when AUTH_TCP_SECRET is not configured in production', () => {
    delete process.env['AUTH_TCP_SECRET'];
    process.env['NODE_ENV'] = 'production';
    const ctx = makeContext({ uid: 'u1' });
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('throws RpcException when the secret is configured but the payload has no _sig', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const ctx = makeContext({ uid: 'u1' });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when _sig does not match the payload', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const ctx = makeContext({ uid: 'u1', _sig: 'wrong-signature' });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('allows the request through and strips _sig when the signature is valid', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const data: Record<string, unknown> = { uid: 'u1', role: 'admin' };
    data['_sig'] = signHmac({ uid: 'u1', role: 'admin' }, 'test-secret');
    const ctx = makeContext(data);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(data).toEqual({ uid: 'u1', role: 'admin' });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx nx test auth -- hmac.guard.unit.test.ts`
Expected: FAIL — `../hmac.guard` doesn't exist yet.

- [ ] **Step 7: Implement the guard**

```typescript
// apps/microservices/auth/src/app/security/hmac.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { formatEnvBanner, verifyHmac } from '@icore/shared';

let warnedMissingSecret = false;

/**
 * Verifies the HMAC signature the gateway attaches to every TCP payload (see
 * AuthClientService.send). AUTH_TCP_SECRET missing crashes boot in production
 * (same missingEnv/formatEnvBanner convention as MS strategy factories); in
 * dev it prints one banner and lets requests through unsigned.
 */
@Injectable()
export class HmacAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env['AUTH_TCP_SECRET'];
    if (!secret) {
      const banner = formatEnvBanner({
        service: 'auth HMAC guard',
        provider: 'AUTH_TCP_SECRET',
        missing: ['AUTH_TCP_SECRET'],
        envPath: 'apps/microservices/auth/.env',
        headline: '⚠  auth HMAC guard — request signatures are NOT being verified',
      });
      if (process.env['NODE_ENV'] === 'production') throw new Error(banner);
      if (!warnedMissingSecret) {
        warnedMissingSecret = true;
        console.warn(banner);
      }
      return true;
    }

    const data = context.switchToRpc().getData() as Record<string, unknown>;
    const sig = data['_sig'];
    if (typeof sig !== 'string') throw new RpcException('missing_signature');

    delete data['_sig'];
    if (!verifyHmac(data, sig, secret)) throw new RpcException('invalid_signature');

    return true;
  }
}
```

- [ ] **Step 8: Wire the guard globally in the auth MS**

```typescript
// apps/microservices/auth/src/app/app.module.ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthProviderModule } from './auth.provider';
import { HmacAuthGuard } from './security/hmac.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/auth/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    AuthProviderModule,
  ],
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: HmacAuthGuard }],
})
export class AppModule {}
```

- [ ] **Step 9: Run guard test to verify it passes**

Run: `npx nx test auth -- hmac.guard.unit.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing test for the client-side signing**

```typescript
// libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
// Add to the same file created/extended in PR2:
import { verifyHmac } from '@icore/shared';

describe('AuthClientService — TCP HMAC signing', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('does not sign requests when AUTH_TCP_SECRET is not configured', async () => {
    delete process.env['AUTH_TCP_SECRET'];
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await service.setRole('u1', 'admin');

    expect(send).toHaveBeenCalledWith('auth.setRole', { uid: 'u1', role: 'admin' });
  });

  it('signs the payload with an HMAC when AUTH_TCP_SECRET is configured', async () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await service.setRole('u1', 'admin');

    expect(send).toHaveBeenCalledWith(
      'auth.setRole',
      expect.objectContaining({ uid: 'u1', role: 'admin', _sig: expect.any(String) }),
    );
    const sentPayload = send.mock.calls[0]?.[1] as { uid: string; role: string; _sig: string };
    expect(verifyHmac({ uid: 'u1', role: 'admin' }, sentPayload._sig, 'test-secret')).toBe(true);
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `npx nx test auth-client -- auth-client.service.unit.test.ts`
Expected: FAIL — `AuthClientService` doesn't sign anything yet.

- [ ] **Step 12: Sign outgoing payloads (final file, building on PR2's `mapRpcErrors`)**

```typescript
// libs/auth-client/src/lib/auth-client.service.ts
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { signHmac } from '@icore/shared';
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

  /**
   * Signs the payload with an HMAC (keyed by AUTH_TCP_SECRET) before sending it
   * over TCP, so the microservice can reject requests from a process that
   * reached the port but doesn't know the shared secret. No-op — identical to
   * a plain client.send — when the secret isn't configured, so this is opt-in
   * and doesn't break existing setups.
   */
  private send<T>(pattern: string, payload: object): Observable<T> {
    const secret = process.env['AUTH_TCP_SECRET'];
    const body = secret ? { ...payload, _sig: signHmac(payload, secret) } : payload;
    return this.client.send<T>(pattern, body);
  }

  verify(token: string): Promise<VerifiedToken> {
    return firstValueFrom(this.send<VerifiedToken>('auth.verify', { token }));
  }

  login(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(firstValueFrom(this.send<AuthSession>('auth.login', { email, password })));
  }

  signup(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.send<AuthSession>('auth.signup', { email, password })),
    );
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.send<AuthSession>('auth.refresh', { refreshToken })),
    );
  }

  async setRole(uid: string, role: string): Promise<void> {
    await firstValueFrom(this.send<{ ok: true }>('auth.setRole', { uid, role }));
  }

  async sendMagicLink(email: string, callbackUrl: string): Promise<void> {
    await firstValueFrom(this.send<{ ok: true }>('auth.magicLink.send', { email, callbackUrl }));
  }

  verifyMagicLink(token: string): Promise<AuthSession> {
    return firstValueFrom(this.send<AuthSession>('auth.magicLink.verify', { token }));
  }

  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    return firstValueFrom(
      this.send<OAuthStartResult>('auth.oauth.start', { provider, callbackUrl }),
    );
  }

  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    return firstValueFrom(
      this.send<AuthSession>('auth.oauth.complete', { provider, code, state }),
    );
  }
}
```

- [ ] **Step 13: Run test to verify it passes**

Run: `npx nx test auth-client`
Expected: PASS — including the PR2 RPC-error-mapping tests (the `send()` refactor is a drop-in replacement for `this.client.send()`, same call sites).

- [ ] **Step 14: Document the new env var on both sides**

```bash
# apps/microservices/auth/.env.example
# insert after line 11 (AUTH_KAFKA_CLIENT_ID=auth), before "# Which concrete AuthStrategy to instantiate":

# Optional TCP request signing — when set, this MS rejects any request that isn't
# HMAC-signed with the same secret. Must match apps/api/.env.
# No-op (open, as before) when unset. Generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_TCP_SECRET=
```

```bash
# apps/api/.env.example
# insert after line 7 (AUTH_PORT=4001), before "# AUTH_REDIS_URL=...":

# Optional TCP request signing — when set, the auth MS rejects any request that isn't
# HMAC-signed with the same secret. Must match apps/microservices/auth/.env.
# No-op (open, as before) when unset. Generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_TCP_SECRET=
```

- [ ] **Step 15: Commit**

```bash
npx prettier --write libs/shared/src/security/hmac.ts libs/shared/src/security/__tests__/hmac.unit.test.ts libs/shared/src/index.ts apps/microservices/auth/src/app/security/hmac.guard.ts apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts apps/microservices/auth/src/app/app.module.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts apps/microservices/auth/.env.example apps/api/.env.example
npx nx lint shared
npx nx lint auth
npx nx lint auth-client
git add libs/shared/src/security libs/shared/src/index.ts apps/microservices/auth/src/app/security apps/microservices/auth/src/app/app.module.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts apps/microservices/auth/.env.example apps/api/.env.example
git commit -m "fix(auth): add opt-in HMAC transport guard, close admin-role escalation via bare TCP"
```

---

### Task 2: Session revocation (`revoke` / logout)

**Files:**
- Modify: `libs/shared/src/strategies/auth.ts:26-37`
- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts`
- Modify: `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`
- Modify: `libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts`
- Modify: `libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts`
- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`
- Modify: `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts`
- Modify: `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts`
- Modify: `apps/microservices/auth/src/app/auth.controller.ts`
- Modify: `libs/auth-client/src/lib/auth-client.service.ts`
- Modify: `apps/api/src/app/auth/auth.controller.ts`

**Interfaces:**
- Produces: `AuthStrategy.revoke(refreshToken: string): Promise<void>` — new required interface method.

**Root cause:** No `AuthStrategy` implementation exposes a way to invalidate a refresh token. Once a session is issued it lives until its natural expiry (`refreshExpiresIn`, default `7d`) with no logout path — a stolen/leaked refresh token, or a user logging out on a shared machine, cannot actually end that session.

**Scope decision:** `postgres`, `mongodb`, and `FakeAuthStrategy` all track sessions in their own table/map keyed by refresh token, so `revoke()` is a straightforward delete. `supabase` and `firebase` manage session lifecycle through their own SDKs in ways that don't map cleanly onto "delete a row keyed by this refresh token string" (Supabase's admin `signOut` takes an access-token JWT, not a refresh token; Firebase's `revokeRefreshTokens(uid)` invalidates by uid, not by token, and this codebase has no uid-from-refresh-token lookup). Implementing `revoke()` for those two providers requires those strategies' own session-tracking redesign — out of scope for this postgres-focused PR. Both throw `not_implemented`, consistent with their existing pattern for other unsupported operations (e.g. `mongodb`'s `startOAuth`/`sendMagicLink`). This is not a regression: today no provider has `revoke()` at all.

- [ ] **Step 1: Write the failing contract test**

```typescript
// libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts
// Add inside runAuthContract(), after the 'used refresh token is rejected after rotation' test:
    it('revoke invalidates the refresh token — a further refresh() call fails', async () => {
      const session = await strategy.signUp('revoke-a@x.com', 'pw12345!');
      await strategy.revoke(session.refreshToken);
      await expect(strategy.refresh(session.refreshToken)).rejects.toThrow();
    });

    it('revoke does not affect other sessions for the same user', async () => {
      const session = await strategy.signUp('revoke-b@x.com', 'pw12345!');
      const other = await strategy.signIn('revoke-b@x.com', 'pw12345!');
      await strategy.revoke(session.refreshToken);
      await expect(strategy.refresh(other.refreshToken)).resolves.toBeTruthy();
    });

    it('revoke is idempotent — revoking an unknown/already-revoked token does not throw', async () => {
      await expect(strategy.revoke('not-a-real-refresh-token')).resolves.toBeUndefined();
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test shared -- auth.contract.unit.test.ts`
Expected: FAIL to compile — `FakeAuthStrategy` (used by `fake-auth.contract.unit.test.ts`, which calls `runAuthContract`) doesn't implement `revoke` yet, so `AuthStrategy` type-checking fails before the new tests even run.

- [ ] **Step 3: Add `revoke` to the interface**

```typescript
// libs/shared/src/strategies/auth.ts
export interface AuthStrategy {
  verifyToken(token: string): Promise<VerifiedToken>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  /**
   * Invalidates a refresh token (logout) — a further refresh() call with it
   * must fail. Idempotent: revoking an already-invalid/unknown token is not
   * an error. Access tokens are short-lived JWTs verified statelessly, so an
   * already-issued access token keeps working until its own expiry; this
   * only prevents minting new ones from the revoked refresh token.
   */
  revoke(refreshToken: string): Promise<void>;
  setRole(uid: string, role: string): Promise<void>;
  getRole(uid: string): Promise<string | null>;
  sendMagicLink(req: MagicLinkRequest): Promise<void>;
  verifyMagicLink(token: string): Promise<AuthSession>;
  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult>;
  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession>;
}
```

- [ ] **Step 4: Implement `revoke` in `FakeAuthStrategy`**

```typescript
// libs/shared/src/strategies/fakes/fake-auth.ts
// Add after refresh():
  async revoke(refreshToken: string): Promise<void> {
    this.refreshToUid.delete(refreshToken);
  }
```

- [ ] **Step 5: Implement `revoke` in `PostgresAuthStrategy`**

```typescript
// libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts
// Add after refresh(), before setRole():
  async revoke(refreshToken: string): Promise<void> {
    await this.ensureTables();
    await this.sql`DELETE FROM _icore_sessions WHERE refresh_token = ${refreshToken}`;
  }
```

- [ ] **Step 6: Implement `revoke` in the postgres test double**

```typescript
// libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts
// Add to the returned object, after refresh():
    async revoke(refreshToken: string): Promise<void> {
      sessions.delete(refreshToken);
    },
```

- [ ] **Step 7: Implement `revoke` in `MongoDbAuthStrategy`**

```typescript
// libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts
// Add after refresh(), before setRole():
  async revoke(refreshToken: string): Promise<void> {
    await this.sessionModel.deleteOne({ refreshToken }).exec();
  }
```

- [ ] **Step 8: Stub `revoke` for supabase and firebase (documented scope boundary, not silent)**

```typescript
// libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts
// Add after refresh():
  async revoke(_refreshToken: string): Promise<void> {
    // Supabase's admin.signOut() revokes by access-token JWT, not by refresh
    // token, and this strategy doesn't retain a refresh-token → JWT mapping.
    // Wiring this properly needs its own session-tracking design — tracked
    // as a follow-up, not implemented here.
    throw new Error('not_implemented');
  }
```

```typescript
// libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts
// Add after refresh():
  async revoke(_refreshToken: string): Promise<void> {
    // Firebase's admin.auth().revokeRefreshTokens(uid) invalidates by uid, not
    // by the opaque refresh-token string, and this strategy has no local
    // refresh-token → uid mapping to bridge the two. Follow-up, not here.
    throw new Error('not_implemented');
  }
```

- [ ] **Step 9: Run the contract + strategy suites to verify they pass**

Run: `npx nx run-many -t test -p shared auth-postgres`
Expected: PASS for `shared`'s `fake-auth.contract.unit.test.ts` and `auth-postgres`'s `postgres-auth.contract.unit.test.ts` (both run `runAuthContract`, which now includes the 3 new revoke cases). `mongodb`/`supabase`/`firebase` are not exercised by `runAuthContract` directly in this repo's own test run (their contract suites live in their own project fixtures, unaffected by this change beyond compiling).

- [ ] **Step 10: Wire the MS message pattern**

```typescript
// apps/microservices/auth/src/app/auth.controller.ts
// Add after the setRole handler:
  @MessagePattern('auth.revoke')
  async revoke(@Payload() payload: { refreshToken: string }): Promise<{ ok: true }> {
    await this.strategy.revoke(payload.refreshToken);
    return { ok: true };
  }
```

- [ ] **Step 11: Wire the gateway client method**

```typescript
// libs/auth-client/src/lib/auth-client.service.ts
// Add after refresh():
  async revoke(refreshToken: string): Promise<void> {
    await firstValueFrom(this.send<{ ok: true }>('auth.revoke', { refreshToken }));
  }
```

- [ ] **Step 12: Wire the gateway `POST /auth/logout` route**

```typescript
// apps/api/src/app/auth/auth.controller.ts
// Add after the refresh() handler, before requestMagicLink():
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token, ending that session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  logout(@Body() body: { refreshToken: string }) {
    return this.authClient.revoke(body.refreshToken);
  }
```

- [ ] **Step 13: Add a controller-level regression test proving logout actually ends the session**

```typescript
// apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts
// Add:
  it('logout (auth.revoke) ends the session — a further refresh fails', async () => {
    const { controller } = fixture();
    const session = await controller.signup({ email: 'logout@x.com', password: 'pw12345!' });
    const result = await controller.revoke({ refreshToken: session.refreshToken });
    expect(result).toEqual({ ok: true });
    await expect(controller.refresh({ refreshToken: session.refreshToken })).rejects.toThrow();
  });
```

- [ ] **Step 14: Run test to verify it passes**

Run: `npx nx test auth -- auth.controller.unit.test.ts`
Expected: PASS.

- [ ] **Step 15: Run the full affected suite**

Run: `npx nx run-many -t test -p shared auth auth-client auth-postgres api`
Expected: all green.

- [ ] **Step 16: Commit**

```bash
npx prettier --write libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts apps/microservices/auth/src/app/auth.controller.ts apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts libs/auth-client/src/lib/auth-client.service.ts apps/api/src/app/auth/auth.controller.ts
npx nx run-many -t lint -p shared auth auth-client auth-postgres api
git add libs/shared/src/strategies libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts apps/microservices/auth/src/app/auth.controller.ts apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts libs/auth-client/src/lib/auth-client.service.ts apps/api/src/app/auth/auth.controller.ts
git commit -m "feat(auth): add session revoke (logout), close missing-revocation gap"
```

---

### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr3-auth-ms-security.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Close two auth MS security gaps: add an opt-in HMAC transport guard (AUTH_TCP_SECRET) so the auth MS's TCP port rejects unsigned requests once configured, closing an admin-role-escalation hole where any process reaching the port could call auth.setRole directly; add AuthStrategy.revoke() (postgres/mongodb/fake implemented, supabase/firebase throw not_implemented pending their own session-tracking design) wired to a new POST /auth/logout route, so a leaked or stolen refresh token — or a shared-machine logout — can actually end that session instead of living until its natural 7-day expiry.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p shared auth auth-client auth-postgres api`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr3-auth-ms-security.md
git commit -m "chore: add changeset for PR3 auth MS security fixes"
```

## Self-Review

- **Spec coverage:** Gap #5 (zero transport auth on the auth MS TCP port) → Task 1. Gap #6 (no revoke/logout) → Task 2. Both closed for the postgres blueprint; mongodb gets the same fix as a side effect since it shares the interface.
- **Placeholder scan:** none — supabase/firebase's `not_implemented` stubs are an explicit, disclosed scope boundary (see Task 2's "Scope decision"), not a placeholder standing in for missing work.
- **Type consistency:** `AuthStrategy.revoke(refreshToken: string): Promise<void>` is identical across all 5 implementations (`postgres`, `mongodb`, `fake`, and the two stubs). `AuthClientService.revoke` mirrors `setRole`'s `Promise<void>`-wrapping-`{ok:true}` pattern from PR2.
