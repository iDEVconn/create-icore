### Task 6: `iCore` — make the existing `POST /auth/logout` cookie-driven

**`POST /auth/logout` already exists** in `apps/api/src/app/auth/auth.controller.ts` (currently, per Task 3's verification):

```ts
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

This task is much smaller than the original (pre-adaptation) version assumed: no new route, no `revokeSession`, no Bearer-token parsing. Just switch the refresh token source from the request body to the `icore_rt` cookie, and clear both cookies afterward — mirroring `refresh`'s cookie-driven shape from Task 5.

**Files:**

- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**

- Consumes: `AuthClientService.revoke` (already exists), `readRefreshToken`, `clearAuthCookies` (Task 2).
- `POST /auth/logout` no longer takes `refreshToken` in the body; stays `@Public()` (it never required the standard auth guard — it authenticates via the cookie's presence, same as `refresh`).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block directly after the `describe('AuthController (gateway) — refresh', ...)` block:

```ts
describe('AuthController (gateway) — logout', () => {
  it('revokes the session using the refresh cookie and clears both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await controller.logout(req, res as unknown as import('express').Response);
    expect(client.revoke).toHaveBeenCalledWith('rt-1');
    expect(res.cookieCleared).toBe(true);
  });

  it('is idempotent when there is no refresh cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = { cookies: {} } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.logout(req, res as unknown as import('express').Response),
    ).resolves.toEqual({ ok: true });
    expect(client.revoke).not.toHaveBeenCalled();
  });
});
```

Add `revoke: vi.fn().mockResolvedValue(undefined),` to the `makeAuthClient()` factory's returned object (not already present — the existing file's `makeAuthClient()` has `signup`/`login`/`refresh`/`sendMagicLink`/`verifyMagicLink`/`startOAuth`/`completeOAuth` but no `revoke` yet).

Check `makeRes()`'s existing `cookieCleared` getter — it's a single shared boolean flag today (flips true on ANY `clearCookie()` call, doesn't distinguish which cookie), which is good enough for these two assertions since `clearAuthCookies` calls `clearCookie` for both `icore_rt` and `icore_csrf`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — logout"`
Expected: FAIL — `logout` still reads `body.refreshToken` and never calls `clearCookie`.

- [ ] **Step 3: Rewire `logout`**

Find the existing `logout` method (shown above) and replace it:

```ts
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the refresh cookie, ending that session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readRefreshToken(req);
    if (refreshToken) {
      await this.authClient.revoke(refreshToken);
    }
    clearAuthCookies(res, { isProd: this.isProd() });
    return { ok: true };
  }
```

Add `readRefreshToken` and `clearAuthCookies` to the `@icore/shared` import (extend the same import line Task 4/5 already added `setAuthCookies`/`generateCsrfToken`/`verifyCsrf` to). Drop the now-unused `@ApiBody` decorator and its schema.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — logout"`
Expected: PASS.

- [ ] **Step 5: Run the full `api` suite for regressions**

Run: `yarn nx test api`
Expected: PASS. Any other test calling `controller.logout({ refreshToken: ... })` with the old body-shaped argument needs updating to the new `(req, res)` signature.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): make POST /auth/logout read the refresh cookie instead of the request body"
```

---
