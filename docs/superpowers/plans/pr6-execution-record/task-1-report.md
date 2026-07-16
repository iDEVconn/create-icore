# Task 1 Report: Supabase `revoke()` + contract-test `revokeIsUserWide` flag infrastructure

## Summary

Implemented `SupabaseAuthStrategy.revoke()` (was `not_implemented` stub) via
`refreshSession()` + `admin.signOut(accessToken, 'local')`, and added the
`revokeIsUserWide?: boolean` flag to the shared `AuthContractHelpers` contract
test infrastructure (for later Firebase use in Task 2). Followed the brief's
step order exactly, with one necessary deviation in the Supabase mock's
internals (see "Deviation" below) discovered via the brief's own TDD steps
4→6.

## Steps executed

1. **Shared contract flag** — added `revokeIsUserWide?: boolean` to
   `AuthContractHelpers` in
   `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts`, and
   replaced the `else` branch's revoke tests with the brief's verbatim
   `if (helpers?.revokeIsUserWide) { ... } else { ... }` split.
   - Ran: `npx nx test shared -- auth.contract.unit.test.ts`
   - Result: PASS — 16/16 (fake-auth contract), unchanged from baseline,
     confirming the flag is behavior-neutral for existing callers (none of
     them set it, so all take the pre-existing `else` path).

2. **Extended the Supabase mock** to track `admin.signOut` —
   `libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts`.
   Reordered `admin` above `auth` per the brief's note, added
   `admin.signOut`, and wired `getUser` to honor signed-out state. See
   "Deviation" below — the tracking mechanism ended up different from the
   brief's literal `Set<string>` of exact tokens.

3. **Wrote the dedicated Supabase test** —
   `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts`,
   copied verbatim from the brief.

4. **Confirmed it fails** (with `revoke()` still stubbed):
   ```
   npx nx test auth-supabase -- supabase-auth.strategy.unit.test.ts
   ```
   Result: FAIL — 2/2 failing, both erroring with `Error: not_implemented`
   thrown from `SupabaseAuthStrategy.revoke` (as expected).

5. **Implemented `revoke()`** in
   `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`, verbatim
   from the brief: `refreshSession()` → `admin.signOut(access_token, 'local')`,
   wrapped in try/catch, swallowing on error/missing session for idempotency.

6. **Ran the dedicated test again** — **initially FAILED**, 1/2
   (`revoke on an already-invalid refresh token` passed; the `admin.signOut`
   assertion test failed with the original access token still resolving via
   `verifyToken`). Root-caused and fixed — see "Deviation" below. After the
   fix:
   ```
   npx nx test auth-supabase -- supabase-auth.strategy.unit.test.ts
   ```
   Result: PASS — 2/2.

7. **Flipped the contract call site** —
   `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts`:
   removed `supportsRevoke: false` and its comment, replaced with the
   brief's comment noting revoke is now fully implemented and per-session.

8. **Ran the full `auth-supabase` suite**:
   ```
   npx nx test auth-supabase
   ```
   Result: PASS — 3 files, 20/20 tests
   (`supabase-auth.strategy.unit.test.ts` 2, `supabase-auth.module.unit.test.ts`
   2, `supabase-auth.contract.unit.test.ts` 16 — includes the 3 full revoke
   contract cases: invalidates / does-not-affect-others / idempotent, since
   `revokeIsUserWide` is unset for Supabase).

9. **Ran the full `shared` suite**:
   ```
   npx nx test shared
   ```
   Result: PASS — 10 files, 68/68 tests. `fake-auth.contract.unit.test.ts`
   (16 tests) unaffected — it never passes `helpers` for its revoke cases, so
   the new flag is a no-op for it, confirming the contract-helper change is
   safe for other callers.

10. **Prettier + lint**:
    ```
    npx prettier --write libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts \
      libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts \
      libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts \
      libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts \
      libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts
    ```
    Result: "All files formatted correctly" (no changes needed).
    ```
    npx nx lint shared
    npx nx lint auth-supabase
    ```
    Result: `shared` — 0 errors, 2 warnings (`no-non-null-assertion`): one at
    `auth.contract.unit.test.ts:158` (pre-existing `helpers.getOAuthCode!`
    call, unrelated to this task's edits, just shifted down a few lines by
    the new block above it), one in `fake-db.ts:49` (pre-existing, untouched
    file). `auth-supabase` — 0 errors, 0 warnings.

11. **Committed** — see commit hash below.

## Deviation from the brief (with reasoning)

**What the brief specified (Step 2):** track signed-out access tokens with a
flat `Set<string>` keyed by the literal JWT string passed to `admin.signOut`.

**What broke:** `revoke()` (Step 5, verbatim from the brief) calls
`refreshSession(refreshToken)` first — which **rotates** the token pair,
producing a brand-new `access_token` distinct from the one in the caller's
original `session` object — and only *that new* token is passed to
`admin.signOut`. The dedicated test (Step 3, verbatim from the brief) then
asserts that `verifyToken(session.accessToken)` — the **original,
pre-rotation** access token — now rejects. With a literal-string `Set`, the
original access token was never touched (only the freshly rotated one was
recorded as signed out), so `getUser` still resolved it successfully and the
test failed:
```
AssertionError: promise resolved "{ uid: 'uid_1', …(2) }" instead of rejecting
```
This is not a typo in my transcription — I re-verified the strategy code,
mock code, and test code all matched the brief's snippets exactly before
concluding the literal-token-Set design cannot make the brief's own test
pass.

**Root cause:** real Supabase JWTs carry a stable `session_id` claim that
persists across refresh-token rotation — a "session" is a lineage of
token-pair generations, not a single token pair. `admin.signOut(jwt, 'local')`
revokes that session identity server-side, which invalidates every access
token ever issued under it (verified via a server-side session-revocation
check, not local JWT decode) — including ones issued before the rotation
that produced the token literally passed to `signOut`. The design spec
itself hints at this ("mock needs to actually track session state... read
the existing mock before extending it; add exactly what's missing").

**Fix applied:** reworked the mock's session tracking to model this lineage
instead of literal-token equality:
- `issueSession(user, sessionId?)` now accepts an optional existing
  `sessionId` to preserve identity across rotation; generates a new one only
  for genuinely new logins (signUp/signIn/OAuth/magic-link/OTP).
- Added `accessToSessionId` / `refreshToSessionId` maps and a
  `revokedSessionIds` set (replacing the brief's `signedOutAccessTokens`
  `Set<string>`).
- `refreshSession` now looks up the old refresh token's `sessionId` before
  deleting it, and passes that same `sessionId` into `issueSession` for the
  rotated pair.
- `admin.signOut` marks the JWT's `sessionId` as revoked (not the literal
  JWT string).
- `getUser` rejects when the token's `sessionId` is in `revokedSessionIds`.

This preserves every existing behavior (each `signUp`/`signIn`/OAuth/OTP call
still gets a fresh, independent session — verified by the still-passing
"revoke does not affect other sessions for the same user" contract case) and
makes both the brief's dedicated test and the full contract/shared suites
pass with no further changes to the strategy or test files. The `revoke()`
implementation itself, the contract-test flag, and the dedicated test file
are all exactly as specified in the brief — only the mock's internal
session-tracking mechanism differs from the literal Step 2 snippet.

## Files touched

- `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts` (modified)
- `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts` (modified)
- `libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts` (modified,
  with the session-lineage deviation above)
- `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts`
  (modified)
- `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts`
  (created, verbatim from brief)

## Commit

`2369889` — `feat(auth): implement SupabaseAuthStrategy.revoke() via refreshSession + admin.signOut('local')`

## Final verification snapshot

- `npx nx test auth-supabase` → 3 files, 20/20 PASS
- `npx nx test shared` → 10 files, 68/68 PASS
- `npx nx lint shared` → 0 errors, 2 pre-existing warnings (unrelated files/lines)
- `npx nx lint auth-supabase` → 0 errors, 0 warnings
- `npx prettier --write <touched files>` → all already formatted correctly
