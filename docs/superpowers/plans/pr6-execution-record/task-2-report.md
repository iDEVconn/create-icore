# Task 2 Report — FirebaseAuthStrategy.revoke() (uid-wide revocation)

## Status: DONE

## Summary

Implemented `FirebaseAuthStrategy.revoke()` exactly per the brief and design spec — no deviations were needed. Unlike Task 1 (Supabase), the brief's literal mock design for this task worked correctly on the first attempt; no analogous "tracking mechanism" bug was hit.

## Steps executed

1. **Interface + mock (`FirebaseAdminAuthLike.revokeRefreshTokens`)** — added the new required method to:
   - `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts` (interface, with JSDoc noting Firebase's revoke is always uid-wide)
   - `libs/auth-strategies/firebase/src/lib/testing/mock-admin-auth.ts` (`FakeAdminAuth` interface + `createMockAdminAuth` implementation — adds the uid to `opts.identityToolkit.revokedUids`)

2. **Mock identity toolkit uid-wide revocation** — `libs/auth-strategies/firebase/src/lib/testing/mock-identity-toolkit.ts`:
   - Added `revokedUids: Set<string>` to the `MockHandle` interface and the object returned by `createMockIdentityToolkit()`.
   - `refresh()` now checks `revokedUids.has(uid)` and throws `USER_DISABLED` before honoring the refresh (checked before the token-rotation `refreshToUid.delete(...)`, per the brief's exact ordering note — the internal exchange inside `revoke()` itself always succeeds because `revokeRefreshTokens(uid)` hasn't been called yet at that point).

3. **Dedicated test file created** — `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts`, verbatim from the brief:
   - Test 1: `signUp` then `signIn` (second session, different refresh token, same user) → `revoke(session.refreshToken)` → asserts `refresh(otherSession.refreshToken)` rejects. This can only pass if `revokeRefreshTokens(uid)` genuinely fired (not just literal-token tracking), since `otherSession.refreshToken` was never touched by the exchange step inside `revoke()`.
   - Test 2: idempotency — `revoke('not-a-real-token')` resolves without throwing.

4. **Confirmed the test failed first** (Step 4) — ran before implementing `revoke()`, got the expected `not_implemented` failures on both tests (see command/output below).

5. **Implemented `revoke()`** in `firebase-auth.strategy.ts` — replaced the `not_implemented` stub with the exchange → verify → `revokeRefreshTokens(uid)` flow wrapped in try/catch (idempotent), exactly as specified in the brief and design spec.

6. **Confirmed the dedicated test passed** (Step 6) — 2/2 pass.

7. **Flipped the contract-test call site** — `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts`: removed `supportsRevoke: false` and its comment, added `revokeIsUserWide: true` with the updated comment, exactly per the brief. (Confirmed via a scout sub-agent that `revokeIsUserWide` already exists in the shared contract harness — added by Task 1's commit `2369889`, along with the branching logic that swaps in the uid-wide "revoke invalidates ALL sessions" case instead of the default "does not affect other sessions" case.)

8. **Ran full `auth-firebase` suite** — 3 test files, 20/20 pass (2 dedicated + 2 module + 16 contract).

9. **Ran full `shared` suite** — 10 test files, 68/68 pass, unaffected (Nx served this from cache; contents confirmed unaffected since no `libs/shared` files were touched).

10. **Prettier + lint + commit** — `npx prettier --write` reported "All files formatted correctly" (no changes needed); `npx nx lint auth-firebase` passed with 0 errors; committed as `d8bd5a0`.

## Deviations from the brief

**None.** This task's brief was written with Task 1's lesson already baked in (uid-based tracking via `revokedUids: Set<string>` rather than literal refresh-token tracking), and it worked correctly as specified — the dedicated test passed on the first implementation attempt after the initial "confirm it fails" run. No mock-tracking redesign was required, unlike Task 1's Supabase session-lineage fix.

## Exact test commands + output

### Step 4 — confirm dedicated test fails (pre-implementation)

```
$ npx nx test auth-firebase -- firebase-auth.strategy.unit.test.ts
```

```
 RUN  v4.1.9 .../libs/auth-strategies/firebase
 ❯ |auth-firebase| src/lib/__tests__/firebase-auth.strategy.unit.test.ts (2 tests | 2 failed) 6ms
     × calls revokeRefreshTokens(uid), invalidating a DIFFERENT still-live session for the same user 4ms
     × revoke on an already-invalid refresh token does not throw (idempotent) 1ms
 Test Files  1 failed (1)
      Tests  2 failed (2)

FAIL ... > calls revokeRefreshTokens(uid) ...
Error: not_implemented
 ❯ FirebaseAuthStrategy.revoke src/lib/firebase-auth.strategy.ts:96:11

FAIL ... > revoke on an already-invalid refresh token does not throw (idempotent)
AssertionError: promise rejected "Error: not_implemented" instead of resolving
```

Matches the brief's expected outcome exactly (FAIL — `revoke()` still throws `not_implemented`).

### Step 6 — confirm dedicated test passes (post-implementation)

```
$ npx nx test auth-firebase -- firebase-auth.strategy.unit.test.ts
```

```
 RUN  v4.1.9 .../libs/auth-strategies/firebase
 ✓ |auth-firebase| src/lib/__tests__/firebase-auth.strategy.unit.test.ts (2 tests) 3ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

PASS (2/2), matches brief's expected outcome.

### Step 8 — full auth-firebase suite (contract + dedicated + module)

```
$ npx nx test auth-firebase
```

```
 RUN  v4.1.9 .../libs/auth-strategies/firebase
 ✓ |auth-firebase| src/lib/__tests__/firebase-auth.strategy.unit.test.ts (2 tests) 9ms
 ✓ |auth-firebase| src/lib/__tests__/firebase-auth.module.unit.test.ts (2 tests) 16ms
 ✓ |auth-firebase| src/lib/__tests__/firebase-auth.contract.unit.test.ts (16 tests) 7ms
 Test Files  3 passed (3)
      Tests  20 passed (20)
```

PASS — 20/20, including the contract's uid-wide revoke case from Task 1's `revokeIsUserWide` branch plus the 2 new dedicated tests. Matches brief's expected outcome.

### Step 9 — full shared suite

```
$ npx nx test shared
```

```
 RUN  v4.1.9 .../libs/shared
 ✓ |shared| src/__tests__/cross-boundary.unit.test.ts (2 tests) 5ms
 ✓ |shared| src/security/__tests__/hmac.unit.test.ts (4 tests) 5ms
 ✓ |shared| src/strategies/__tests__/provide-strategy.unit.test.ts (4 tests) 8ms
 ✓ |shared| src/abilities/__tests__/ability.unit.test.ts (9 tests) 10ms
 ✓ |shared| src/__tests__/jobs.unit.test.ts (2 tests) 10ms
 ✓ |shared| src/__tests__/bootstrap.unit.test.ts (3 tests) 21ms
 ✓ |shared| src/__tests__/transport.unit.test.ts (9 tests) 11ms
 ✓ |shared| src/strategies/__tests__/fake-storage.contract.unit.test.ts (7 tests) 8ms
 ✓ |shared| src/strategies/__tests__/fake-auth.contract.unit.test.ts (16 tests) 6ms
 ✓ |shared| src/strategies/__tests__/fake-db.contract.unit.test.ts (12 tests) 9ms
 Test Files  10 passed (10)
      Tests  68 passed (68)
```

PASS — 68/68, unaffected (Nx cache-hit; no `libs/shared` files were touched by this task).

### Prettier + lint (pre-commit)

```
$ npx prettier --write libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts libs/auth-strategies/firebase/src/lib/testing/mock-admin-auth.ts libs/auth-strategies/firebase/src/lib/testing/mock-identity-toolkit.ts libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts
Prettier: All files formatted correctly

$ npx nx lint auth-firebase
> eslint .
 NX   Successfully ran target lint for project auth-firebase
```

0 lint errors.

## Files changed

- `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts` — added `revokeRefreshTokens` to `FirebaseAdminAuthLike`; implemented `revoke()`.
- `libs/auth-strategies/firebase/src/lib/testing/mock-admin-auth.ts` — added `revokeRefreshTokens` to `FakeAdminAuth` + implementation.
- `libs/auth-strategies/firebase/src/lib/testing/mock-identity-toolkit.ts` — added `revokedUids: Set<string>` to `MockHandle`; `refresh()` now checks revocation before honoring rotation.
- `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts` — flipped `supportsRevoke: false` → `revokeIsUserWide: true`.
- `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts` — new file, 2 dedicated tests.

## Commit

`d8bd5a0` — `feat(auth): implement FirebaseAuthStrategy.revoke() via identityToolkit exchange + revokeRefreshTokens(uid)`

5 files changed, 63 insertions(+), 7 deletions(-).

## Notes for Task 3 / PR time

- No `.changeset/*.md` was added in this task's commit, mirroring Task 1's commit (`2369889`), which also didn't add one. Per `AGENTS.md`'s mandatory changeset rule, a changeset covering the combined Task 1 + Task 2 work (or one per task) will need to exist before the PR opens — worth confirming this is handled in Task 3 or right before `gh pr create --base dev`.
- This task did not touch any `package.json`, so no yarn.lock concerns, as anticipated.
