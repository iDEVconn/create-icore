### Task 5: Gateway endpoints

**Files:**

- Modify: `apps/api/src/app/auth/auth.controller.ts` (2 routes, `BadRequestException` import)
- Modify (append): `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts` (extend `makeAuthClient` with the 2 new mocked methods)

**Interfaces:**

- Consumes: `AuthClientService.requestPasswordReset/confirmPasswordReset` (Task 4), existing `clientOrigin()`, `startSession`, `resolveRole`.
- Produces: `POST /api/auth/password/forgot` `{email}` → `200 {ok:true}` always; `POST /api/auth/password/reset` `{token, password}` → `{user}` + session cookies (or 400 `password_too_short` / `invalid_reset_token`).

- [ ] **Step 1: Write the failing tests.** In `makeAuthClient()` add `requestPasswordReset: vi.fn().mockResolvedValue(undefined),` and `confirmPasswordReset: vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, user: { id: 'u1', email: 'a@x.com' } }),`. Add `BadRequestException` to the test's `@nestjs/common` import and append:

```ts
describe('AuthController — password reset', () => {
  let sessionStore: FakeSessionStore;
  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('forgot builds the callback from CLIENT_ORIGIN and answers {ok:true}', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(
      client,
      makeConfig({ CLIENT_ORIGIN: 'https://my.app' }),
      sessionStore,
    );
    await expect(controller.forgotPassword({ email: 'a@x.com' })).resolves.toEqual({ ok: true });
    expect(client.requestPasswordReset).toHaveBeenCalledWith(
      'a@x.com',
      'https://my.app/reset-password',
    );
  });

  it('forgot answers the SAME {ok:true} when the provider throws (no account enumeration)', async () => {
    const client = makeAuthClient();
    (client.requestPasswordReset as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('EMAIL_NOT_FOUND'),
    );
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    await expect(controller.forgotPassword({ email: 'nobody@x.com' })).resolves.toEqual({
      ok: true,
    });
  });

  it('reset rejects a short password with 400 BEFORE calling the provider', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    await expect(
      controller.resetPassword({ token: 't', password: 'short' }, mockRes()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("reset kills the user's old local sessions, then starts a new one (cookies + {user})", async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const old = await sessionStore.create({
      uid: 'u1',
      email: 'a@x.com',
      providerAccessToken: 'at0',
      providerRefreshToken: 'rt0',
      providerAccessTokenExpiresAt: Date.now() + 3_600_000,
    });
    const res = mockRes();

    const result = await controller.resetPassword({ token: 'tok', password: 'newpw123!' }, res);

    expect(client.confirmPasswordReset).toHaveBeenCalledWith('tok', 'newpw123!');
    expect(await sessionStore.get(old.sessionId)).toBeNull();
    expect(result).toEqual({ user: { id: 'u1', email: 'a@x.com', role: 'user' } });
    expect(res.cookies['icore_sid']).toBeTruthy();
    expect(await sessionStore.get(res.cookies['icore_sid'])).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `yarn nx test api -- auth.controller.unit`. Expected: FAIL (`forgotPassword`/`resetPassword` not defined).

- [ ] **Step 3: Implement.** Add `BadRequestException` to the `@nestjs/common` import list and, after `verifyMagicLink`:

```ts
  @Public()
  @SkipCsrf()
  @Post('password/forgot')
  @Throttle({ 'auth-burst': { limit: 5, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Email a password-reset link (always 200 — never reveals whether the account exists)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } },
    },
  })
  async forgotPassword(@Body() body: { email: string }) {
    try {
      await this.authClient.requestPasswordReset(
        body.email,
        `${this.clientOrigin()}/reset-password`,
      );
    } catch (err) {
      // Same answer for known and unknown addresses, so the response can't be
      // used to enumerate accounts. The cause is only logged.
      this.logger.warn('forgotPassword: provider error swallowed', err);
    }
    return { ok: true as const };
  }

  @Public()
  @SkipCsrf()
  @Post('password/reset')
  @ApiOperation({
    summary: 'Set a new password from a reset token, end all other sessions, start a new one',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'password'],
      properties: { token: { type: 'string' }, password: { type: 'string', minLength: 8 } },
    },
  })
  async resetPassword(
    @Body() body: { token: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (typeof body.password !== 'string' || body.password.length < 8) {
      throw new BadRequestException('password_too_short');
    }
    const session = await this.authClient.confirmPasswordReset(body.token, body.password);
    // The strategy already ended every provider session; drop the local ones
    // BEFORE creating the new one so it is not caught by the sweep.
    await this.sessionStore.deleteAllForUser(session.user.id);
    return this.startSession(session, res, await this.resolveRole(session.accessToken));
  }
```

(`Throttle` and `seconds` are already imported in this file.)

- [ ] **Step 4: Verify** — `yarn nx test api` PASS; `yarn nx run-many -t lint build -p api` green.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/auth
git add apps/api/src/app/auth
git commit -m "feat(api): POST /auth/password/forgot (always 200) and /password/reset (kills old sessions)"
```

---
