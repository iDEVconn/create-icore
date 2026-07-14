### Task 1: `setRole` / `sendMagicLink` stop returning bare `void`

**Files:**
- Modify: `apps/microservices/auth/src/app/auth.controller.ts:43-51`
- Modify: `apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts:41-48,74-79`
- Modify: `libs/auth-client/src/lib/auth-client.service.ts:27-33`
- Create: `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`

**Interfaces:**
- Produces: `AuthController.setRole` and `.sendMagicLink` now return `Promise<{ ok: true }>` instead of `Promise<void>`. `AuthClientService.setRole`/`.sendMagicLink` keep their external `Promise<void>` signature (they `await` the `{ ok: true }` internally and return nothing).

**Root cause:** A NestJS TCP `@MessagePattern` handler returning `undefined` produces an RxJS observable that completes with **no emission**. `firstValueFrom()` on the client side then throws `"no elements in sequence"` instead of resolving — this is a real production failure mode (not reproducible with a mocked `ClientProxy.send` returning `of(undefined)`, since a plain mock observable always emits regardless of the value). The fix: never send an empty response over this transport: return a truthy sentinel object.

- [ ] **Step 1: Write the failing test (MS side) — assert non-void responses**

```typescript
// apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts
// Replace the body of 'setRole writes a role visible on verify after re-login':
  it('setRole writes a role visible on verify after re-login', async () => {
    const { controller } = fixture();
    const session = await controller.signup({ email: 's@x.com', password: 'pw12345!' });
    const result = await controller.setRole({ uid: session.user.id, role: 'admin' });
    // Non-empty object, not bare void — a firstValueFrom() client waiting on
    // this over TCP throws "no elements in sequence" on an empty response.
    expect(result).toEqual({ ok: true });
    const re = await controller.login({ email: 's@x.com', password: 'pw12345!' });
    const verified = await controller.verify({ token: re.accessToken });
    expect(verified.role).toBe('admin');
  });

// Replace the body of 'sendMagicLink forwards email + callbackUrl to the strategy':
  it('sendMagicLink forwards email + callbackUrl to the strategy', async () => {
    const { strategy, controller } = fixture();
    const result = await controller.sendMagicLink({
      email: 'ml@x.com',
      callbackUrl: 'http://localhost/cb',
    });
    expect(result).toEqual({ ok: true });
    const token = strategy.getLastMagicLinkToken('ml@x.com');
    expect(token).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test auth -- auth.controller.unit.test.ts`
Expected: FAIL — `result` is `undefined`, not `{ ok: true }`.

- [ ] **Step 3: Fix the MS controller**

```typescript
// apps/microservices/auth/src/app/auth.controller.ts
  @MessagePattern('auth.setRole')
  async setRole(@Payload() payload: { uid: string; role: string }): Promise<{ ok: true }> {
    await this.strategy.setRole(payload.uid, payload.role);
    return { ok: true };
  }

  @MessagePattern('auth.magicLink.send')
  async sendMagicLink(
    @Payload() payload: { email: string; callbackUrl: string },
  ): Promise<{ ok: true }> {
    await this.strategy.sendMagicLink(payload);
    return { ok: true };
  }
```

Note: `assignInitialRole()` (private helper) calls `this.strategy.setRole(uid, role)` directly against the strategy, not `this.setRole(...)`, so it is unaffected by this signature change.

- [ ] **Step 4: Run MS test to verify it passes**

Run: `npx nx test auth -- auth.controller.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test (gateway client side)**

```typescript
// libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { AuthClientService } from '../auth-client.service';

describe('AuthClientService — wire contract', () => {
  it('setRole() sends uid+role and resolves against the real {ok:true} wire response', async () => {
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.setRole('u1', 'admin')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith('auth.setRole', { uid: 'u1', role: 'admin' });
  });

  it('sendMagicLink() sends email+callbackUrl and resolves against the real {ok:true} wire response', async () => {
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.sendMagicLink('a@x.com', 'http://localhost/cb')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith('auth.magicLink.send', {
      email: 'a@x.com',
      callbackUrl: 'http://localhost/cb',
    });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx nx test auth-client -- auth-client.service.unit.test.ts`
Expected: FAIL — this test file is new; it fails because `setRole`/`sendMagicLink` still type their `client.send` call as `<void>`, not because behavior is wrong yet at the mock level (the mock always emits). Proceed to Step 7 to bring the client code in line with the real wire contract this test documents.

- [ ] **Step 7: Fix the client service**

```typescript
// libs/auth-client/src/lib/auth-client.service.ts
  async setRole(uid: string, role: string): Promise<void> {
    // `{ ok: true }`, not void — an empty/undefined TCP response completes
    // the observable with no emission, and firstValueFrom() throws "no
    // elements in sequence" instead of resolving.
    await firstValueFrom(this.client.send<{ ok: true }>('auth.setRole', { uid, role }));
  }

  async sendMagicLink(email: string, callbackUrl: string): Promise<void> {
    await firstValueFrom(
      this.client.send<{ ok: true }>('auth.magicLink.send', { email, callbackUrl }),
    );
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx nx test auth-client -- auth-client.service.unit.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
npx prettier --write apps/microservices/auth/src/app/auth.controller.ts apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
npx nx lint auth
npx nx lint auth-client
git add apps/microservices/auth/src/app/auth.controller.ts apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
git commit -m "fix(auth): void MessagePattern handlers crash the TCP client — return {ok:true}"
```

---

