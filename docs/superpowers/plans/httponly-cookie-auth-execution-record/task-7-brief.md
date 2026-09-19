### Task 7: `iCore` — cookie-issuing on the OAuth callback

**Files:**

- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**

- The OAuth callback's redirect fragment drops `refreshToken`.

- [ ] **Step 1: Write the failing test**

Find the existing test `'oauthCallback exchanges + redirects to the client with a fragment'` in `describe('AuthController (gateway) — OAuth', ...)` and replace it:

```ts
it('oauthCallback exchanges, sets auth cookies, and redirects with accessToken only in the fragment', async () => {
  const client = makeAuthClient();
  const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'http://client' }));
  const res = makeRes();
  const req = { cookies: { oauth_state: 'abc' } } as unknown as import('express').Request;
  await controller.oauthCallback(
    'google',
    'code-xyz',
    'abc',
    req,
    res as unknown as import('express').Response,
  );
  expect(client.completeOAuth).toHaveBeenCalledWith('google', 'code-xyz', 'abc');
  expect(res.cookieCleared).toBe(true);
  expect(res.cookies['icore_rt']).toBe('rt');
  expect(res.redirectedTo).toContain('http://client/auth/oauth/callback#');
  expect(res.redirectedTo).toContain('accessToken=at');
  expect(res.redirectedTo).not.toContain('refreshToken=');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test api -t "oauthCallback exchanges"`
Expected: FAIL — the fragment still includes `refreshToken=rt` and no `icore_rt` cookie is set.

- [ ] **Step 3: Rewire `oauthCallback`**

Find:

```ts
const session = await this.authClient.completeOAuth(provider, code, state);
res.clearCookie('oauth_state');
const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
const fragment = new URLSearchParams({
  accessToken: session.accessToken,
  refreshToken: session.refreshToken,
  userId: session.user.id,
  email: session.user.email,
});
return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
```

Replace with:

```ts
const session = await this.authClient.completeOAuth(provider, code, state);
res.clearCookie('oauth_state');
const csrfToken = generateCsrfToken();
setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
const fragment = new URLSearchParams({
  accessToken: session.accessToken,
  userId: session.user.id,
  email: session.user.email,
});
return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test api -t "oauthCallback exchanges"`
Expected: PASS.

- [ ] **Step 5: Run the full `api` suite for regressions**

Run: `yarn nx test api`
Expected: PASS.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): issue httpOnly refresh cookie on OAuth callback; drop refreshToken from redirect fragment"
```

---
