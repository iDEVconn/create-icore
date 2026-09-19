### Task 4: `iCore` — cookie-issuing on login/register/magic-link-verify + CORS

**Files:**

- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**

- Consumes: `setAuthCookies`, `generateCsrfToken` (Task 2).
- `register`/`login`/`verifyMagicLink` response bodies change from `{accessToken, refreshToken, user}` to `{accessToken, user}`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`, find `describe('AuthController (gateway) — magic-link', ...)` and replace the whole block with (the existing 3 tests plus 3 new cookie-asserting ones):

```ts
describe('AuthController (gateway) — magic-link', () => {
  it('requestMagicLink builds callback URL from CLIENT_ORIGIN', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'https://my.app' }));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith('a@x.com', 'https://my.app/auth/callback');
  });

  it('requestMagicLink falls back to http://localhost:4200 when CLIENT_ORIGIN unset', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith(
      'a@x.com',
      'http://localhost:4200/auth/callback',
    );
  });

  it('verifyMagicLink forwards the token, sets auth cookies, and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.verifyMagicLink(
      { token: 'tok' },
      res as unknown as import('express').Response,
    );
    expect(client.verifyMagicLink).toHaveBeenCalledWith('tok');
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('login sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.login(
      { email: 'a@x.com', password: 'pw' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('register sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.register(
      { email: 'a@x.com', password: 'password123' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
  });
});
```

Note: `login`'s existing mock in `makeAuthClient()` resolves `{accessToken:'at', refreshToken:'rt', expiresIn:3600, user:{id:'u1',email:'a@x.com'}}` — reuse it, but confirm `client.login`/`client.signup`/`client.verifyMagicLink` in `makeAuthClient()` all return this exact shape before writing these assertions (read the file's current `makeAuthClient()` first — if any of the three use a different mock, align the test's expected `session` shape with whatever `AuthSession`-shaped mock that mock actually returns).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — magic-link"`
Expected: FAIL — `verifyMagicLink`/`login`/`register` don't yet accept a `res` param, don't set cookies, and still return `refreshToken` in the body.

- [ ] **Step 3: Add `isProd` resolution and rewire `register`**

In `apps/api/src/app/auth/auth.controller.ts`, add this import at the top (alongside the existing `@icore/shared` import — merge into the existing `import type {...} from '@icore/shared'` line's non-type siblings, or add a second import line):

```ts
import { setAuthCookies, generateCsrfToken } from '@icore/shared';
```

Add this private helper right after the `assertProvider` function (top-level, before the `@ApiTags` class decorator):

Actually — add it as a private method on the class instead, since it needs `this.cfg`. Find the closing `}` of the `uid` private method (the last method in the class) and add directly before the class's final closing `}`:

```ts
  private isProd(): boolean {
    return this.cfg.get<string>('NODE_ENV') === 'production';
  }
```

Then find `async register(@Body() body: { email: string; password: string }) {` and replace its signature and body:

```ts
  async register(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.authClient.signup(body.email, body.password);
      const csrfToken = generateCsrfToken();
      setAuthCookies(res, {
        refreshToken: session.refreshToken,
        csrfToken,
        isProd: this.isProd(),
      });
      return { accessToken: session.accessToken, user: session.user };
    } catch (err) {
      const msg =
        (err as { message?: string; code?: string })?.message ??
        (err as { code?: string })?.code ??
        '';
      if (msg === 'email_confirmation_required') {
        throw new BadRequestException('email_confirmation_required');
      }
      throw err;
    }
  }
```

- [ ] **Step 4: Rewire `login`**

Find:

```ts
  login(@Body() body: { email: string; password: string }) {
    return this.authClient.login(body.email, body.password);
  }
```

Replace with:

```ts
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.login(body.email, body.password);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

- [ ] **Step 5: Rewire `verifyMagicLink`**

Find:

```ts
  verifyMagicLink(@Body() body: { token: string }) {
    return this.authClient.verifyMagicLink(body.token);
  }
```

Replace with:

```ts
  async verifyMagicLink(
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.verifyMagicLink(body.token);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

- [ ] **Step 6: Enable CORS in `main.ts`**

In `apps/api/src/main.ts`, find `app.use(cookieParser());` and add directly after it:

```ts
app.enableCors({
  origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:4200',
  credentials: true,
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — magic-link"`
Expected: PASS — all 6 tests.

- [ ] **Step 8: Run the full `api` suite to check for regressions**

Run: `yarn nx test api`
Expected: PASS — other tests that call `login`/`register`/`verifyMagicLink` without a `res` argument will now fail to compile/run; fix each by adding `makeRes()` as the second argument, matching Step 1's pattern. Search the whole test file for other call sites of these three methods first (`grep -n "controller.login(\|controller.register(\|controller.verifyMagicLink(" apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`) and update every one found.

- [ ] **Step 9: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts apps/api/src/main.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts apps/api/src/main.ts
git commit -m "feat(auth): issue httpOnly refresh cookie on login/register/magic-link-verify; enable CORS"
```

---
