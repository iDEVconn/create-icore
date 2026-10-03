### Task 4: Gateway — 202 on register, shared `clientOrigin()` with warning

**Files:**

- Modify: `apps/api/src/app/auth/auth.controller.ts` (`register`, `requestMagicLink`, new private helper, imports)
- Modify (append + small helper edit): `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**

- Consumes: `AuthClientService.signup(email, password, callbackUrl?)` (Task 3).
- Produces: `POST /auth/register` → `201 {user}` + cookies, or `202 {status:'confirmation_required', email}` and no cookies.

- [ ] **Step 1: Write the failing tests.** In the test file add `status: vi.fn(() => res),` to the object built in `mockRes()` (next to `redirect`) and add `HttpStatus` import from `@nestjs/common`; then append:

```ts
describe('AuthController — register', () => {
  let sessionStore: FakeSessionStore;
  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('answers 202 confirmation_required, sets no cookies and creates no session', async () => {
    const client = makeAuthClient();
    (client.signup as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'confirmation_required',
      user: { id: 'u1', email: 'a@x.com' },
    });
    const controller = new AuthController(
      client,
      makeConfig({ CLIENT_ORIGIN: 'https://my.app' }),
      sessionStore,
    );
    const res = mockRes();

    const result = await controller.register({ email: 'a@x.com', password: 'pw12345!' }, res);

    expect(result).toEqual({ status: 'confirmation_required', email: 'a@x.com' });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
    expect(res.cookies['icore_sid']).toBeUndefined();
    expect(client.signup).toHaveBeenCalledWith(
      'a@x.com',
      'pw12345!',
      'https://my.app/auth/callback',
    );
  });

  it('still starts a session and returns { user } when the provider issued one', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();

    const result = await controller.register({ email: 'a@x.com', password: 'pw12345!' }, res);

    expect(result).toEqual({ user: { id: 'u1', email: 'a@x.com', role: 'user' } });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.cookies['icore_sid']).toBeTruthy();
  });

  it('warns once when CLIENT_ORIGIN is unset and falls back to localhost:4200', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);

    await controller.register({ email: 'a@x.com', password: 'pw12345!' }, mockRes());
    await controller.requestMagicLink({ email: 'a@x.com' });

    expect(client.signup).toHaveBeenCalledWith(
      'a@x.com',
      'pw12345!',
      'http://localhost:4200/auth/callback',
    );
    expect(warn.mock.calls.filter(([m]) => String(m).includes('CLIENT_ORIGIN'))).toHaveLength(1);
    warn.mockRestore();
  });
});
```

(add `Logger` to the `@nestjs/common` import in the test: `import { HttpStatus, Logger, UnauthorizedException } from '@nestjs/common';`)

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test api --testFile=auth.controller.unit`
Expected: FAIL (register returns a session for every result; no `clientOrigin()` warning).

- [ ] **Step 3: Implement** — in `apps/api/src/app/auth/auth.controller.ts` add `HttpStatus` to the `@nestjs/common` import list, add the field + helper next to the other private methods, and replace `register` and `requestMagicLink`:

```ts
  private warnedMissingClientOrigin = false;

  /** Where provider emails (confirm / magic-link) send the user back to. */
  private clientOrigin(): string {
    const origin = this.cfg.get<string>('CLIENT_ORIGIN');
    if (origin) return origin;
    if (!this.warnedMissingClientOrigin) {
      this.warnedMissingClientOrigin = true;
      this.logger.warn(
        'CLIENT_ORIGIN is not set — emails will link to http://localhost:4200. Set it to your client URL (and the same value as Site URL in Supabase → Authentication → URL Configuration).',
      );
    }
    return 'http://localhost:4200';
  }
```

```ts
  async register(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authClient.signup(
      body.email,
      body.password,
      `${this.clientOrigin()}/auth/callback`,
    );
    if ('status' in result) {
      // Account created, but the provider wants the email confirmed first —
      // no session exists, so no cookies.
      res.status(HttpStatus.ACCEPTED);
      return { status: 'confirmation_required' as const, email: result.user.email };
    }
    return this.startSession(result, res, await this.resolveRole(result.accessToken));
  }
```

```ts
  requestMagicLink(@Body() body: { email: string }) {
    return this.authClient.sendMagicLink(body.email, `${this.clientOrigin()}/auth/callback`);
  }
```

Also update the `@ApiOperation` summary of `register` to `'Create a new user (201 + session, or 202 when email confirmation is required)'`.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn nx test api` — Expected: PASS (existing magic-link tests unchanged).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git add apps/api/src/app/auth
git commit -m "fix(api): register answers 202 confirmation_required instead of 500; warn on missing CLIENT_ORIGIN

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
