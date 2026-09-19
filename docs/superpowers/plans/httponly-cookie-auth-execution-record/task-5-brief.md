### Task 5: `iCore` — cookie-driven, CSRF-protected `/auth/refresh`

**Files:**

- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**

- Consumes: `readRefreshToken`, `verifyCsrf`, `setAuthCookies`, `generateCsrfToken` (Task 2).
- `POST /auth/refresh` no longer takes `refreshToken` in the body.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`, directly after the (now-updated) `describe('AuthController (gateway) — magic-link', ...)` block:

```ts
describe('AuthController (gateway) — refresh', () => {
  it('rejects when the CSRF header does not match the CSRF cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(ForbiddenException);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('rejects when there is no refresh cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: {},
      headers: {},
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('on success, calls refresh with the cookie token and re-issues both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    const result = await controller.refresh(req, res as unknown as import('express').Response);
    expect(client.refresh).toHaveBeenCalledWith('rt-1');
    expect(result).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — refresh"`
Expected: FAIL — `refresh` still reads `body.refreshToken`, doesn't check CSRF, doesn't set cookies.

- [ ] **Step 3: Rewire `refresh`**

Find:

```ts
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a fresh access token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  refresh(@Body() body: { refreshToken: string }) {
    return this.authClient.refresh(body.refreshToken);
  }
```

Replace with:

```ts
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange the httpOnly refresh cookie for a fresh access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) throw new UnauthorizedException('invalid_refresh_token');
    const session = await this.authClient.refresh(refreshToken);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

Add `readRefreshToken` and `verifyCsrf` to the `@icore/shared` import added in Task 4 (extend that same import line to `{ setAuthCookies, generateCsrfToken, readRefreshToken, verifyCsrf }`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — refresh"`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Run the full `api` suite for regressions**

Run: `yarn nx test api`
Expected: PASS. Any other test calling `controller.refresh(...)` with the old `{refreshToken}` body signature needs updating to the new `(req, res)` signature — search and fix as in Task 4 Step 8.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): make /auth/refresh cookie-driven and CSRF-protected"
```

---
