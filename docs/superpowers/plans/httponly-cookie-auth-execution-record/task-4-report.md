# Task 4 Report — cookie-issuing on login/register/magic-link-verify + CORS

## What was implemented

- `apps/api/src/app/auth/auth.controller.ts`:
  - Added `import { setAuthCookies, generateCsrfToken } from '@icore/shared';` alongside the existing `import type { OAuthProvider } from '@icore/shared';` line.
  - Added a private `isProd(): boolean` method (reads `NODE_ENV === 'production'` via `this.cfg`) as the last method in the class, before the closing `}`.
  - `register(body, @Res({ passthrough: true }) res: Response)`: now `async`, calls `this.authClient.signup(...)`, generates a CSRF token, calls `setAuthCookies(res, { refreshToken, csrfToken, isProd: this.isProd() })`, and returns `{ accessToken, user }` only (no `refreshToken` in the body).
  - `login(body, @Res({ passthrough: true }) res: Response)`: same pattern, wraps `this.authClient.login(...)`.
  - `verifyMagicLink(body, @Res({ passthrough: true }) res: Response)`: same pattern, wraps `this.authClient.verifyMagicLink(...)`.
- `apps/api/src/main.ts`: added `app.enableCors({ origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:4200', credentials: true });` directly after `app.use(cookieParser());`.
- `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`: replaced the `AuthController (gateway) — magic-link` describe block per the brief (6 tests: 2 unchanged `requestMagicLink` tests + 3 new cookie-asserting tests for `verifyMagicLink`/`login`/`register` + kept structure). Left `AuthController (gateway) — OAuth` describe block untouched (out of scope — `oauthCallback` still puts `refreshToken` in the URL fragment, which Task 4 does not touch).

## Live-file drift found beyond the register() ruling

The brief's Step 1 note said: "`login`'s existing mock in `makeAuthClient()` resolves `{accessToken:'at', refreshToken:'rt', expiresIn:3600, user:{id:'u1',email:'a@x.com'}}` — reuse it, but confirm `client.login`/`client.signup`/`client.verifyMagicLink` in `makeAuthClient()` all return this exact shape before writing these assertions."

Checking the live file: `signup: vi.fn()` and `login: vi.fn()` had **no** `.mockResolvedValue(...)` at all — they'd resolve to `undefined`. Only `verifyMagicLink`, `startOAuth`, and `completeOAuth` had the `{accessToken:'at', refreshToken:'rt', expiresIn:3600, user:{id:'u1',email:'a@x.com'}}` shape. Calling `controller.login(...)`/`controller.register(...)` against the old mocks would throw (`session.refreshToken` on `undefined`), and the brief's new tests could never pass as written.

Resolution: added `.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, user: { id: 'u1', email: 'a@x.com' } })` to both `signup` and `login` in `makeAuthClient()`, matching the exact `AuthSession` shape already used by `verifyMagicLink`/`startOAuth`/`completeOAuth` in the same helper. This is purely fixing a test-double gap needed to exercise the very calls the brief specifies — no production behavior was invented.

No other drift found: the `@icore/shared` import line, the CORS snippet placement (`app.use(cookieParser())` immediately precedes it), and the login/verifyMagicLink method bodies all matched the brief exactly. (The brief's Step 3 mention of "the closing `}` of the `uid` private method" doesn't exist in this file — there is no `uid` method — so I added `isProd()` as the last method before the class's closing brace instead, per the brief's own fallback instruction: "add it as a private method on the class instead... before the class's final closing `}`".)

Per the controller's explicit ruling, `register()` was implemented as the minimal version — no try/catch, no `BadRequestException`, no `email_confirmation_required` handling.

## TDD evidence

**RED** — `yarn nx test api -t "AuthController .gateway. — magic-link"` (after writing tests, before controller changes):

```
FAIL src/app/auth/__tests__/auth.controller.unit.test.ts > ... > verifyMagicLink forwards the token, sets auth cookies, and returns accessToken+user only
AssertionError: expected { accessToken: 'at', …(3) } to deeply equal { accessToken: 'at', user: { …(2) } }
- Expected
+ Received
  {
    "accessToken": "at",
+   "expiresIn": 3600,
+   "refreshToken": "rt",
    "user": { "email": "a@x.com", "id": "u1" },
  }
...
FAIL ... login sets auth cookies and returns accessToken+user only  (same shape)
FAIL ... register sets auth cookies and returns accessToken+user only  (same shape)
Test Files  1 failed | 8 passed (9)
     Tests  3 failed | 45 passed (48)
```

Failed for the right reason: response bodies still contained `refreshToken`/`expiresIn`, no cookies were set yet (controller methods hadn't been rewired).

**GREEN** — `yarn nx test api -t "AuthController .gateway. — magic-link"` (after controller + main.ts changes):

```
✓ api src/app/auth/__tests__/auth.controller.unit.test.ts (9 tests) 12ms
Test Files  9 passed (9)
     Tests  48 passed (48)
```

## Full `api` suite result

`yarn nx test api`:

```
Test Files  9 passed (9)
     Tests  48 passed (48)
```

No other call sites of `login`/`register`/`verifyMagicLink` existed anywhere else in `apps/api/src` (confirmed via grep before and after) — no regression fixes needed beyond the one test file.

## Format / lint / build

- `npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts apps/api/src/main.ts` — all three reported `(unchanged)`.
- `yarn nx lint api` — `✔ All files pass linting`.
- `yarn nx build api` — `webpack compiled successfully`.

## Files changed

- `apps/api/src/app/auth/auth.controller.ts`
- `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`
- `apps/api/src/main.ts`

(pre-existing unstaged `yarn.lock` change from before this task was left untouched, not part of this commit)

## Commit

`14957f6` — `feat(auth): issue httpOnly refresh cookie on login/register/magic-link-verify; enable CORS`

## Self-review

- **Completeness:** all 3 methods (`register`, `login`, `verifyMagicLink`) issue cookies via `setAuthCookies` + `generateCsrfToken`, response bodies trimmed to `{ accessToken, user }`, CORS enabled with `credentials: true` in `main.ts`. Confirmed via test assertions on `res.cookies['icore_rt']` / `res.cookies['icore_csrf']`.
- **Quality:** matches existing file style — same `@Public()`/`@ApiOperation()`/`@ApiBody()` decorator patterns, same `@Res({ passthrough: true })` idiom already used nowhere else in this file (new), consistent with how `oauthStart`/`oauthCallback` use `@Res()` (non-passthrough, since those return via `res.redirect`).
- **Discipline:** no try/catch or `BadRequestException`/`email_confirmation_required` added to `register()`, per the controller's ruling. Nothing touched outside the three specified files. `oauthCallback`'s refresh-token-in-URL-fragment behavior deliberately left alone (out of scope for this task).
- **Testing:** tests assert actual cookie values set on the `res` mock (`res.cookies['icore_rt']`/`res.cookies['icore_csrf']`), not just that `authClient` methods were called — real behavior verification. Full `api` suite passes, output pristine (no warnings beyond pre-existing Nx deprecation notices unrelated to this change).

## Concerns

None. The `makeAuthClient()` mock fix for `signup`/`login` was necessary and minimal — it only supplies a return value where none existed, matching the shape already used by sibling mocks in the same function.
