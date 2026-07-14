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

