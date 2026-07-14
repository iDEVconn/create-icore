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

