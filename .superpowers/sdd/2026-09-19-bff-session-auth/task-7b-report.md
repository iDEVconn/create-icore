# Task 7b — Fix: admin revoke-user does not revoke provider refresh tokens

## Problem

`AuthController.revokeUser` called `sessionStore.deleteAllForUser(uid)`, which only
deleted the app's own `SessionRecord`s from the store (Redis/Fake). It never touched
the underlying provider (Supabase/Firebase/MongoDB/Postgres) refresh token those
records held, so an admin "kill every session" action left the provider-level
refresh token valid indefinitely — inconsistent with `logout()`, which already does
capture-record → delete → best-effort provider revoke.

## What I implemented

### 1. `libs/shared/src/session/session-store.ts`
Changed the `SessionStore.deleteAllForUser` interface signature from
`Promise<void>` to `Promise<SessionRecord[]>` (returns the deleted records).

### 2. `libs/shared/src/session/fakes/fake-session-store.ts`
`FakeSessionStore.deleteAllForUser` now collects each matching record into a
`deleted` array before removing it from the in-memory map, and returns that array.

### 3. `libs/shared/src/session/redis-session-store.ts`
`RedisSessionStore.deleteAllForUser` now:
1. `smembers` to get the session ids for the uid (unchanged).
2. Fetches each session's full record via `this.get(id)` (sequential reads via
   `Promise.all`, done BEFORE any deletes — this step is necessarily non-atomic
   since it's a set of reads, not writes) and filters out any nulls (session
   already expired/gone between the smembers read and this get).
3. Runs the existing `multi()` batch of `del` calls for the session keys +
   `USER_SESSIONS_KEY` — unchanged, still a single atomic delete batch.
4. Returns the array of fetched records.

This preserves the original atomicity guarantee for the delete step; only the
new read step is sequential, which is fine since reads don't need atomicity here
(worst case is a session created concurrently with the revoke is missed, which
is the pre-existing race for the whole `deleteAllForUser` operation anyway).

### 4. `libs/shared/src/session/__tests__/session-store.contract.ts`
Extended the existing `deleteAllForUser() kills every session for that uid,
leaves others` test (runs against both `FakeSessionStore` and
`RedisSessionStore` via the shared harness) to assert on the return value:
- `deleted` has length 2 (the two u1 sessions).
- `deleted`'s `sessionId`s match `s1.sessionId` and `s2.sessionId` exactly (sorted
  comparison).
- Every returned record has `uid === 'u1'`.
- The `other` user's session is not present in `deleted`.

### 5. `apps/api/src/app/auth/auth.controller.ts`
`revokeUser` now:
```ts
async revokeUser(@Param('uid') uid: string) {
  const records = await this.sessionStore.deleteAllForUser(uid);
  await Promise.allSettled(
    records.map((record) =>
      this.authClient.revoke(record.providerRefreshToken).catch((err) => {
        this.logger.warn(
          `revokeUser: provider revoke failed for session ${record.sessionId}`,
          err,
        );
      }),
    ),
  );
  return { ok: true };
}
```
Matches `logout()`'s pattern: delete-first (session already dead server-side
regardless of provider outcome), then best-effort revoke each provider token,
logging (not throwing) on failure. Uses `Promise.allSettled` since there can be
multiple sessions/tokens to revoke here (unlike logout's single session).

### 6. `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`
- Extended `admin revoke-user kills every session for that uid` to also assert
  `client.revoke` was called with the deleted session's `providerRefreshToken`
  (`'rt1'`).
- Added a new test, `still returns { ok: true } when the provider revoke rejects
  for one of the killed sessions`, mirroring the existing logout revoke-failure
  test: mocks `authClient.revoke` to reject, asserts `revokeUser` still resolves
  to `{ ok: true }`, the session is still deleted from the store, and `revoke`
  was still called with the right token. The warn log fired as expected during
  the test run (visible in test output, not asserted directly — matches the
  existing style, which doesn't assert on `logger.warn` calls either for the
  analogous `logout` failure test).

## Testing

- `yarn nx test shared -- session-store` → 2 test files, 12/12 tests passed:
  - `fake-session-store.contract.unit.test.ts` (6 tests)
  - `redis-session-store.contract.integration.test.ts` (6 tests) — ran against a
    real Redis at `redis://localhost:6379` (confirmed reachable; this is the
    integration variant of the shared contract, not skipped).
- `yarn nx test api -- auth.controller` → 20/20 tests passed (up from 19 before
  this change), including the two updated/added revoke-user tests. Log output
  during the run shows both expected `WARN` lines for the provider-revoke-failure
  tests (logout's existing one, and the new revokeUser one) — confirming the
  catch/log path actually executes, not just that promises resolve silently.
- `yarn nx lint shared` → 0 errors (2 pre-existing warnings, unrelated files:
  `strategies/__tests__/auth.contract.unit.test.ts`, `strategies/fakes/fake-db.ts`
  — non-null-assertion warnings, not touched by this change).
- `yarn nx lint api` → 0 errors, "All files pass linting".
- `npx prettier --write` run on all 6 touched files; `npx prettier --check`
  confirmed clean before commit.

## Files changed

- `libs/shared/src/session/session-store.ts`
- `libs/shared/src/session/fakes/fake-session-store.ts`
- `libs/shared/src/session/redis-session-store.ts`
- `libs/shared/src/session/__tests__/session-store.contract.ts`
- `apps/api/src/app/auth/auth.controller.ts`
- `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

Commit: `8528048` — "fix(auth): revoke provider refresh tokens on admin revoke-user"

## Self-review findings

- **Completeness:** Interface, both implementations, contract test, controller,
  and controller test are all updated consistently. Grepped the repo for any
  other `deleteAllForUser` callers or mock implementations that might need
  updating — found none beyond the 6 files listed above.
- **Quality:** `RedisSessionStore`'s delete batch is still a single `multi()`/
  `exec()` — atomicity for the actual deletes is unchanged from before. Only the
  new read-before-delete step is sequential (`Promise.all` of `get()` calls),
  which is a read, not a write, so no atomicity was lost.
- **Discipline:** Only touched the files and lines needed for this fix. Did not
  refactor `logout()`, `withRefreshLock()`, or any other unrelated code
  encountered while reading these files.
- **Testing:** Both new/updated tests assert on real behavior — the actual
  `authClient.revoke` call with the exact `providerRefreshToken` value, and the
  contract test asserts on the actual contents of the returned array (session
  ids, uid field, absence of the other user's session), not just that the code
  ran without throwing.

## Issues or concerns

None. The change is small, symmetric with the existing `logout()` pattern, and
fully covered by tests against both `FakeSessionStore` and a real Redis
instance.
