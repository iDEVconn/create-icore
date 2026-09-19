# Task 5 Report — cookie-driven, CSRF-protected `/auth/refresh`

## What was implemented

`apps/api/src/app/auth/auth.controller.ts`'s `refresh()` method was rewired from a body-driven
handler to a cookie-driven, CSRF-protected one:

- Signature changed from `refresh(@Body() body: { refreshToken: string })` to
  `async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response)`.
- Reads the refresh token via `readRefreshToken(req)` (the `icore_rt` cookie). Missing cookie →
  `UnauthorizedException('invalid_refresh_token')`.
- Verifies the CSRF double-submit pair via `verifyCsrf(req)` (the `icore_csrf` cookie vs the
  `x-csrf-token` header). Mismatch → `ForbiddenException('csrf_mismatch')`.
- On success, calls `this.authClient.refresh(refreshToken)`, generates a fresh CSRF token, and
  re-issues both cookies via `setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken,
isProd: this.isProd() })`.
- Returns `{ accessToken: session.accessToken, user: session.user }`.
- Removed the now-stale `@ApiBody` schema for the request-body `refreshToken`; updated
  `@ApiOperation` summary to reflect the cookie source.
- Extended the existing `@icore/shared` import line (added by Task 4) from
  `{ setAuthCookies, generateCsrfToken }` to
  `{ setAuthCookies, generateCsrfToken, readRefreshToken, verifyCsrf }`, and added
  `ForbiddenException` to the `@nestjs/common` import.

### Deviation from the brief's literal snippet: check order

The brief's Step 3 snippet checks CSRF **before** refresh-cookie presence:

```ts
if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
const refreshToken = readRefreshToken(req);
if (!refreshToken) throw new UnauthorizedException('invalid_refresh_token');
```

Running the brief's own three tests verbatim against this exact snippet produces a failure: in
"rejects when there is no refresh cookie" (`cookies: {}, headers: {}`), `verifyCsrf` returns
`false` when both cookie and header are absent (see `libs/shared/src/http/auth-cookies.ts`'s
`verifyCsrf`, unmodified — `!cookieValue || !headerValue` → `false`), so with CSRF checked first
the handler throws `ForbiddenException`, not the `UnauthorizedException` the test expects.

I swapped the order — check `readRefreshToken` first, `verifyCsrf` second — which makes all three
of the brief's literal tests pass, and still satisfies both scenarios named in the self-review
criterion ("present-cookie-but-bad-CSRF" → Forbidden; "missing-cookie-but-valid-CSRF" → CSRF check
passes trivially since both sides match, then falls through to Unauthorized) because order between
those two checks is only observable in the fully-empty-request case, which the literal test
requires to be Unauthorized. This is a correctness fix, not scope creep — same two exceptions,
same conditions, only the order swapped, and it is arguably the more sound design (an
unauthenticated request with zero cookies is "not logged in", not "CSRF attack").

Flagging this explicitly as a self-review finding / concern since it contradicts the brief's
literal code snippet and its check-order description, even though it satisfies the brief's literal
tests and stated exception semantics.

## TDD evidence

### RED

Command: `yarn nx test api -t "AuthController .gateway. — refresh"`

Result before implementing `refresh()`'s rewire (old body-driven method still in place, new tests
added): 3 failed / 48 passed. Failures were the expected shape — e.g.:

```
AssertionError: promise resolved "{ accessToken: 'at', …(3) }" instead of rejecting
  ...controller.refresh(req, res as unknown as import('express').Resp…
  ).rejects.toThrow(ForbiddenException);
```

and for the success case:

```
AssertionError: expected "vi.fn()" to be called with arguments: [ 'rt-1' ]
Received: 1st vi.fn() call: [ undefined ]
```

Confirms the old `refresh(@Body() body)` handler ignored the cookie/CSRF-shaped `req` entirely and
called `authClient.refresh(undefined)`.

### GREEN

After rewiring `refresh()` (with the check-order swap described above):

Command: `yarn nx test api -t "AuthController .gateway. — refresh"`
Result: `Test Files 9 passed (9)`, `Tests 51 passed (51)` (Vitest's `-t` filter runs full files
containing a match; all pass, including the 3 new refresh tests and the pre-existing 48).

## Full `api` suite result

Command: `yarn nx test api`
Result: `Test Files 9 passed (9)`, `Tests 51 passed (51)`. No regressions.

## Files changed

- `apps/api/src/app/auth/auth.controller.ts`
- `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

## Post-coding routine

- `npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts` → both "unchanged" (already formatted).
- `yarn nx lint api` → "All files pass linting".
- `yarn nx build api` → webpack compiled successfully.

## Self-review

- **Completeness:** Both exceptions are reachable and independently testable. A
  missing-cookie-but-valid-CSRF request throws `UnauthorizedException` (cookie check first); a
  present-cookie-but-bad-CSRF request throws `ForbiddenException` (matches self-review's named
  scenarios). See the "Deviation" section above for the one edge case (both totally absent) where
  I diverged from the brief's literal snippet ordering to make its own tests pass.
- **Quality:** Matches the file's existing exception-throwing style (`throw new
XException('snake_case_reason')`, same pattern as `oauthCallback`'s
  `UnauthorizedException('oauth_state_mismatch')` and `assertProvider`'s
  `UnauthorizedException('unknown_oauth_provider: ...')`). `register`/`login`/`verifyMagicLink`'s
  cookie re-issue pattern (`generateCsrfToken()` + `setAuthCookies(res, {...})` +
  `{ accessToken, user }` return shape) is followed exactly.
- **Discipline:** Only `refresh()` was touched in the controller; `logout` and `oauthCallback` are
  untouched. No other files were modified. Confirmed via `git diff` before commit — diff touches
  only the import lines and the `refresh` method body/decorators.
- **Testing:** All three new tests assert real thrown-exception types
  (`rejects.toThrow(ForbiddenException)` / `rejects.toThrow(UnauthorizedException)`) and real
  cookie values on the mock `res` (`res.cookies['icore_rt']` / `res.cookies['icore_csrf']`), not
  just call counts. The `refresh` mock on `makeAuthClient()` was given a `mockResolvedValue`
  (previously bare `vi.fn()`, which would have made the success test hang/resolve to `undefined`
  and fail the `result` assertion) — matching the same session shape used by
  `signup`/`login`/`verifyMagicLink`. Full suite output is pristine (no console noise, no skipped
  tests).
- Searched the repo for other callers of the gateway `AuthController.refresh` with the old
  `{refreshToken}` body shape (dispatched a research agent to check this exhaustively, since it
  would be easy to miss an e2e/spec file) — none exist. The only other `refresh(...)`-shaped
  callers in the repo are: (a) the _microservice_ `AuthController.refresh(@Payload() payload: {
refreshToken })`, a different, unrelated class not in scope for this task; and (b) various
  `AuthStrategy`/`AuthClientService`/`identityToolkit`-level callers that already take a plain
  string token, unaffected by this change.

## Concerns

- The check-order deviation described above (refresh-cookie-presence checked before CSRF, instead
  of the brief's literal CSRF-then-cookie order) is the only meaningful concern. It was necessary
  to make the brief's own three tests pass given `verifyCsrf`'s existing (Task 2, unmodified)
  semantics. Flagging for the controller/reviewer to confirm this is the intended resolution.
