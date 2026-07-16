### Task 2: HMAC replay protection — signed timestamp + clock-skew window

**Files:**
- Modify: `libs/auth-client/src/lib/auth-client.service.ts`
- Modify: `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`
- Modify: `apps/microservices/auth/src/app/security/hmac.guard.ts`
- Modify: `apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts`

**Root cause:** the HMAC guard (PR3) verifies the signature but has no concept of freshness — a process that captures one valid signed request (e.g. `auth.setRole` granting admin) can replay it at any point in the future and it will still verify successfully, since nothing about the payload changes over time.

- [ ] **Step 1: Write the failing guard tests**

```typescript
// apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
// Replace the whole file's content with this (adds _ts to every payload the
// existing tests construct, plus 3 new freshness-specific cases):
import { describe, it, expect, afterEach, vi } from 'vitest';
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
    vi.useRealTimers();
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
    const ctx = makeContext({ uid: 'u1', _ts: Date.now() });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the payload has no _ts', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const data = { uid: 'u1' };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when _sig does not match the payload', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const ctx = makeContext({ uid: 'u1', _ts: Date.now(), _sig: 'wrong-signature' });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the timestamp is older than the clock-skew tolerance (replay)', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const staleTs = Date.now() - 60_000; // 60s old — outside the 30s tolerance
    const data = { uid: 'u1', _ts: staleTs };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the timestamp is in the future beyond tolerance (clock skew abuse)', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const futureTs = Date.now() + 60_000;
    const data = { uid: 'u1', _ts: futureTs };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('allows the request through and strips _sig + _ts when the signature is valid and fresh', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const data: Record<string, unknown> = { uid: 'u1', role: 'admin', _ts: Date.now() };
    data['_sig'] = signHmac(data, 'test-secret');
    const ctx = makeContext(data);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(data).toEqual({ uid: 'u1', role: 'admin' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test auth -- hmac.guard.unit.test.ts`
Expected: FAIL — the guard doesn't require or check `_ts` yet, so the "no `_ts`", "stale timestamp", and "future timestamp" cases don't throw; the "allows and strips" case's final assertion fails since `_ts` isn't stripped.

- [ ] **Step 3: Implement timestamp verification in the guard**

```typescript
// apps/microservices/auth/src/app/security/hmac.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { formatEnvBanner, verifyHmac } from '@icore/shared';

let warnedMissingSecret = false;

// How much clock drift between gateway and auth MS (plus network latency) to
// tolerate before treating a signed request as expired/replayed. 30s is
// generous for same-datacenter traffic and small enough that a captured
// request has a narrow window to be replayed in.
const MAX_CLOCK_SKEW_MS = 30_000;

/**
 * Verifies the HMAC signature the gateway attaches to every TCP payload (see
 * AuthClientService.send), plus a signed timestamp (`_ts`) to reject replayed
 * requests outside a clock-skew tolerance window. In production
 * (NODE_ENV=production), an unset/empty AUTH_TCP_SECRET causes per-request
 * rejection at runtime via canActivate, resulting in 100% traffic failure
 * (not a boot crash). Outside production, it logs one warning and lets
 * requests through unsigned.
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
    const ts = data['_ts'];
    if (typeof ts !== 'number') throw new RpcException('missing_timestamp');

    const signedPayload = { ...data };
    delete signedPayload['_sig'];
    if (!verifyHmac(signedPayload, sig, secret)) throw new RpcException('invalid_signature');

    if (Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) {
      throw new RpcException('signature_expired');
    }

    delete data['_sig'];
    delete data['_ts'];
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test auth -- hmac.guard.unit.test.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Write the failing client-side test for the signed timestamp**

```typescript
// libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
// Replace the existing 'signs the payload with an HMAC when AUTH_TCP_SECRET is configured' test with:
  it('signs the payload with an HMAC and a timestamp when AUTH_TCP_SECRET is configured', async () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    const before = Date.now();
    await service.setRole('u1', 'admin');
    const after = Date.now();

    expect(send).toHaveBeenCalledWith(
      'auth.setRole',
      expect.objectContaining({
        uid: 'u1',
        role: 'admin',
        _ts: expect.any(Number),
        _sig: expect.any(String),
      }),
    );
    const sentPayload = send.mock.calls[0]?.[1] as {
      uid: string;
      role: string;
      _ts: number;
      _sig: string;
    };
    expect(sentPayload._ts).toBeGreaterThanOrEqual(before);
    expect(sentPayload._ts).toBeLessThanOrEqual(after);
    expect(
      verifyHmac({ uid: 'u1', role: 'admin', _ts: sentPayload._ts }, sentPayload._sig, 'test-secret'),
    ).toBe(true);
  });
```

(Keep the existing `'does not sign requests when AUTH_TCP_SECRET is not configured'` test unchanged — it asserts the exact unsigned payload shape, which doesn't gain a `_ts` either when the secret is absent.)

- [ ] **Step 6: Run test to verify it fails**

Run: `npx nx test auth-client -- auth-client.service.unit.test.ts`
Expected: FAIL — `send()` doesn't add `_ts` yet, so `sentPayload._ts` is `undefined` and the `verifyHmac` re-check (which now expects `_ts` to be part of the signed payload) doesn't match what was actually signed.

- [ ] **Step 7: Add the signed timestamp to the client's `send()`**

```typescript
// libs/auth-client/src/lib/auth-client.service.ts
  /**
   * Signs the payload (plus a timestamp, for replay protection) with an HMAC
   * keyed by AUTH_TCP_SECRET before sending it over TCP, so the microservice
   * can reject requests from a process that reached the port but doesn't know
   * the shared secret, and reject replays of a previously-captured request
   * outside the guard's clock-skew tolerance window. No-op — identical to a
   * plain client.send — when the secret isn't configured, so this is opt-in
   * and doesn't break existing setups.
   */
  private send<T>(pattern: string, payload: object): Observable<T> {
    const secret = process.env['AUTH_TCP_SECRET'];
    if (!secret) return this.client.send<T>(pattern, payload);
    const timestamped = { ...payload, _ts: Date.now() };
    const body = { ...timestamped, _sig: signHmac(timestamped, secret) };
    return this.client.send<T>(pattern, body);
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx nx test auth-client -- auth-client.service.unit.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full affected suites**

Run: `npx nx run-many -t test -p auth auth-client`
Expected: all green — including the pre-existing RPC-error-mapping tests in `auth-client.service.unit.test.ts` (unaffected — they mock rejected observables, never reach the signing branch) and the full `auth.controller.unit.test.ts`/other MS tests (unaffected — they call the controller directly, bypassing the guard entirely, same as before).

- [ ] **Step 10: Commit**

```bash
npx prettier --write libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts apps/microservices/auth/src/app/security/hmac.guard.ts apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
npx nx lint auth
npx nx lint auth-client
git add libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts apps/microservices/auth/src/app/security/hmac.guard.ts apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
git commit -m "feat(auth): add HMAC replay protection — signed timestamp + 30s clock-skew window"
```

---

