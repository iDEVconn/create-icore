# Task 1 Report: HMAC transport guard on the auth MS

## Status: DONE

## Commit
`468de22` — fix(auth): add opt-in HMAC transport guard, close admin-role escalation via bare TCP

## Pre-flight check (per instructions)

Read `libs/auth-client/src/lib/auth-client.service.ts` and its test file before editing, as
instructed, since two earlier merged PRs touched this area. Both files matched the brief's
"before" expectations exactly (plain `this.client.send(...)` calls, `RPC_ERROR_MAP` /
`mapRpcErrors` helper already in place from PR2, existing "wire contract" and "RPC error
mapping" test blocks). No discrepancy found — proceeded per the brief without needing to stop
for NEEDS_CONTEXT.

Also verified `formatEnvBanner` (used by the new guard) already exists in `libs/shared/src/env.ts`
with the exact signature the brief's guard code expects (`service`, `provider`, `missing`,
`envPath`, `headline`).

Also verified line numbers in both `.env.example` files matched the brief's "insert after line N"
instructions exactly (auth MS: line 11 `AUTH_KAFKA_CLIENT_ID=auth`; gateway: line 7
`AUTH_PORT=4001`).

## What was done (files, all repo-root paths)

1. **Created** `libs/shared/src/security/hmac.ts` — `signHmac` / `verifyHmac` using
   `node:crypto` `createHmac('sha256', ...)` + `timingSafeEqual`, with a try/catch around the
   hex `Buffer.from` so a malformed signature returns `false` instead of throwing.
2. **Created** `libs/shared/src/security/__tests__/hmac.unit.test.ts` — verbatim from the brief
   (4 tests: round-trip verify, wrong secret, tampered payload, malformed hex).
3. **Modified** `libs/shared/src/index.ts` — added `export * from './security/hmac';`.
4. **Created** `apps/microservices/auth/src/app/security/hmac.guard.ts` — `HmacAuthGuard`
   implementing `CanActivate`: no secret configured → warn once and allow in dev, throw in
   production (`NODE_ENV === 'production'`); secret configured → require a string `_sig` on the
   RPC payload, strip it, and verify it with `verifyHmac`, throwing `RpcException` on
   missing/invalid signature.
5. **Created** `apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts` —
   verbatim from the brief (5 tests).
6. **Modified** `apps/microservices/auth/src/app/app.module.ts` — registered
   `{ provide: APP_GUARD, useClass: HmacAuthGuard }` as a global guard.
7. **Modified** `libs/auth-client/src/lib/auth-client.service.ts` — added a private `send()`
   wrapper that signs the payload with `signHmac(payload, secret)` under `_sig` when
   `AUTH_TCP_SECRET` is set, otherwise passes the payload through unchanged; all existing call
   sites (`verify`, `login`, `signup`, `refresh`, `setRole`, `sendMagicLink`, `verifyMagicLink`,
   `startOAuth`, `completeOAuth`) now route through `this.send(...)` instead of
   `this.client.send(...)` directly. This is a drop-in replacement — PR2's `mapRpcErrors` /
   `RPC_ERROR_MAP` machinery is untouched.
8. **Modified** `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts` — added the
   `afterEach` import, `verifyHmac` import, and the new "AuthClientService — TCP HMAC signing"
   describe block (2 tests), verbatim from the brief, appended after the existing "RPC error
   mapping" block.
9. **Modified** `apps/microservices/auth/.env.example` — inserted the `AUTH_TCP_SECRET=` block
   (with comment) after `AUTH_KAFKA_CLIENT_ID=auth`, before the AuthStrategy provider comment.
10. **Modified** `apps/api/.env.example` — inserted the `AUTH_TCP_SECRET=` block (with comment)
    after `AUTH_PORT=4001`, before `# AUTH_REDIS_URL=...`.

No `package.json` changes were required (no new dependencies — `node:crypto` is a Node builtin
already usable in these projects), so `yarn install` was not run.

## Test commands run and results

1. `npx nx test shared -- hmac.unit.test.ts`
   - Before implementing `hmac.ts`: **FAIL** — `Cannot find module '../hmac'`.
   - After implementing: **PASS** — 4/4 tests.

2. `npx nx test auth -- hmac.guard.unit.test.ts`
   - Before implementing the guard: **FAIL** — `Cannot find module '../hmac.guard'`.
   - After implementing guard + wiring `app.module.ts`: **PASS** — 5/5 tests.

3. `npx nx test auth-client -- auth-client.service.unit.test.ts`
   - Before implementing the signing change: **6 passed, 1 failed** — the new "signs the
     payload with an HMAC..." test failed because `send` was still called with the plain
     `{ uid, role }` payload (no `_sig`). The other new test ("does not sign requests when
     AUTH_TCP_SECRET is not configured") passed trivially since unsigned behavior was already
     correct.
   - After implementing the `send()` wrapper: **PASS** — 7/7 tests.

4. Full-suite regression checks:
   - `npx nx test shared` → **PASS** — 10 test files, 65 tests.
   - `npx nx test auth` → **PASS** — 5 test files, 32 tests (includes the new
     `hmac.guard.unit.test.ts` 5-test file alongside the pre-existing
     `auth.controller.unit.test.ts` and the supabase/postgres/firebase integration suites).
   - `npx nx test auth-client` → **PASS** — 1 test file, 7 tests (includes both PR2's original
     5 tests and the 2 new HMAC-signing tests).

## Lint / format

- `npx prettier --write <all touched files>` — ran once; reformatted
  `libs/auth-client/src/lib/auth-client.service.ts` (collapsed a few multi-line
  `firstValueFrom(...)` calls that now fit on one line since the wrapper method is short). Re-ran
  the auth-client test suite afterward to confirm the reformat didn't break anything (still 7/7
  pass).
- `npx nx lint shared` → 0 errors (2 pre-existing warnings, both in files untouched by this task:
  `strategies/__tests__/auth.contract.unit.test.ts` and `strategies/fakes/fake-db.ts` —
  `no-non-null-assertion`).
- `npx nx lint auth` → 0 errors, 0 warnings.
- `npx nx lint auth-client` → 0 errors, 0 warnings.

## Deviations from the brief

None. Implemented all files and tests verbatim as specified. The only non-mechanical judgment
call was confirming that `formatEnvBanner`'s existing signature in `libs/shared/src/env.ts`
matched what the brief's `hmac.guard.ts` code expects — it matched exactly, so no adaptation was
needed.

## Commit

```
468de22 fix(auth): add opt-in HMAC transport guard, close admin-role escalation via bare TCP
10 files changed, 218 insertions(+), 21 deletions(-)
```

Working tree is clean after the commit (`git status --short` empty).
