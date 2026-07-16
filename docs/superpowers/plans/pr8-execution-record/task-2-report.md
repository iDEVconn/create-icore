# Task 2 Report: HMAC replay protection — signed timestamp + clock-skew window

## Summary

Implemented replay protection for the auth MS's opt-in HMAC transport guard by adding a
signed `_ts` (timestamp) field alongside the existing `_sig` field, with a 30s clock-skew
tolerance window enforced in `HmacAuthGuard`. Followed the brief exactly, in the exact
order specified (guard tests → guard impl → client test → client impl → full suite → commit).
No deviations from the brief were required — every step worked as written.

## Files changed

- `apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts` — replaced
  wholesale with the brief's 8-case version (5 original cases + `_ts` added to their payloads,
  plus 3 new freshness cases: missing `_ts`, stale `_ts` (60s old, outside 30s tolerance),
  future `_ts` (60s ahead, outside tolerance)).
- `apps/microservices/auth/src/app/security/hmac.guard.ts` — added `MAX_CLOCK_SKEW_MS = 30_000`
  constant; guard now requires `_ts` to be a `number` (throws `RpcException('missing_timestamp')`
  if not), verifies the signature over the payload with `_ts` still included (only `_sig`
  stripped before `verifyHmac`), then checks `Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS`
  and throws `RpcException('signature_expired')` if outside tolerance. On success, strips both
  `_sig` and `_ts` from the mutated payload before returning `true`.
- `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts` — replaced the
  'signs the payload with an HMAC when AUTH_TCP_SECRET is configured' test with the brief's
  timestamp-aware version (asserts `_ts` is a number bounded by `before`/`after` timestamps,
  and re-verifies the HMAC over `{ uid, role, _ts }` using the actual sent `_ts`). Left the
  'does not sign requests when AUTH_TCP_SECRET is not configured' test unchanged, per the brief.
- `libs/auth-client/src/lib/auth-client.service.ts` — `send()` now builds
  `timestamped = { ...payload, _ts: Date.now() }` first, then signs and sends
  `{ ...timestamped, _sig: signHmac(timestamped, secret) }` — so the signature covers the
  timestamp. Still a no-op (plain `client.send`) when `AUTH_TCP_SECRET` is unset.

## Deviations from the brief

None. Every step's code was used verbatim from the brief and every predicted
pass/fail outcome matched exactly on the first attempt — no root-cause diagnosis needed.

## Exact commands run and their output

### Step 1-2: write failing guard tests, confirm failure

```
npx nx test auth -- hmac.guard.unit.test.ts
```
Result: 4 failed, 4 passed (8 total) — exactly the 4 the brief predicted:
- "throws RpcException when the payload has no _ts" — FAILED (didn't throw)
- "throws RpcException when the timestamp is older than the clock-skew tolerance (replay)" — FAILED (didn't throw)
- "throws RpcException when the timestamp is in the future beyond tolerance (clock skew abuse)" — FAILED (didn't throw)
- "allows the request through and strips _sig + _ts when the signature is valid and fresh" — FAILED
  (`_ts` was not stripped from `data`, so `toEqual({ uid: 'u1', role: 'admin' })` failed)

### Step 3-4: implement guard, confirm pass

```
npx nx test auth -- hmac.guard.unit.test.ts
```
Result: **8 passed (8)** — all green.

### Step 5-6: write failing client test, confirm failure

```
npx nx test auth-client -- auth-client.service.unit.test.ts
```
Result: 1 failed, 6 passed (7 total). The new
"signs the payload with an HMAC and a timestamp when AUTH_TCP_SECRET is configured" test
failed as predicted: `send` was called with a plain object (no `_ts`/`_sig` matcher wrapping),
so `toHaveBeenCalledWith(..., expect.objectContaining({ _ts: expect.any(Number), ... }))`
did not match.

### Step 7-8: implement client signing, confirm pass

```
npx nx test auth-client -- auth-client.service.unit.test.ts
```
Result: **7 passed (7)** — all green.

### Step 9: full affected suites

```
npx nx run-many -t test -p auth auth-client
```
Result: **all green.**
- `auth`: 5 test files, 36 tests passed (hmac.guard.unit.test.ts 8/8,
  auth.controller.supabase.integration.unit.test.ts 5/5,
  auth.controller.unit.test.ts 16/16,
  auth.controller.firebase.integration.unit.test.ts 5/5,
  auth.controller.postgres.integration.unit.test.ts 2/2).
- `auth-client`: 1 test file, 7 tests passed.

Re-ran the full suite again after prettier/lint to confirm nothing regressed — same result
(36/36 auth, 7/7 auth-client; auth-client came from Nx cache on the second run).

### Prettier + lint (step 10 prerequisites)

```
npx prettier --write libs/auth-client/src/lib/auth-client.service.ts \
  libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts \
  apps/microservices/auth/src/app/security/hmac.guard.ts \
  apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
```
Prettier reformatted one line-wrap in the client test file (the multi-line `verifyHmac(...)`
call); no functional change.

```
npx nx lint auth
npx nx lint auth-client
```
Both: **0 errors, 0 warnings.**

### Git hygiene check

`git status --porcelain` showed only the 4 intended files as modified both before and after
running builds/tests/lint — no `tools/create-icore/templates/` drift to discard.

## Commit

```
git add libs/auth-client/src/lib/auth-client.service.ts \
  libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts \
  apps/microservices/auth/src/app/security/hmac.guard.ts \
  apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
git commit -m "feat(auth): add HMAC replay protection — signed timestamp + 30s clock-skew window"
```

Commit hash: `f4af5be` — 4 files changed, 89 insertions(+), 21 deletions(-).
Pre-commit hook (lint-staged + `nx affected -t lint test`) ran clean, no `--no-verify` used.

## Status

DONE. All 8 guard test cases + all 7 client test cases pass; full affected suite (auth +
auth-client, 43 tests total) green; lint clean on both projects; changes committed.
