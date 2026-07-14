# Task 1 Report: `setRole` / `sendMagicLink` stop returning bare `void`

## Summary

Followed the brief in `.superpowers/sdd/task-1-brief.md` step by step (TDD: failing test → fix → passing test) for both the MS-side controller and the gateway-side client.

## Steps executed

### Step 1 — Write failing MS-side tests
Edited `apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts`:
- `'setRole writes a role visible on verify after re-login'` now captures `result = await controller.setRole(...)` and asserts `expect(result).toEqual({ ok: true })`.
- `'sendMagicLink forwards email + callbackUrl to the strategy'` now captures `result = await controller.sendMagicLink(...)` and asserts the same.

Both edits are verbatim from the brief.

### Step 2 — Confirm MS test fails
```
npx nx test auth -- auth.controller.unit.test.ts
```
Result: **FAIL** — 2 of 15 tests failed as expected:
```
AssertionError: expected undefined to deeply equal { ok: true }
```
(both `setRole` and `sendMagicLink` tests failed with `result` = `undefined`).

### Step 3 — Fix the MS controller
Edited `apps/microservices/auth/src/app/auth.controller.ts`:
```ts
@MessagePattern('auth.setRole')
async setRole(@Payload() payload: { uid: string; role: string }): Promise<{ ok: true }> {
  await this.strategy.setRole(payload.uid, payload.role);
  return { ok: true };
}

@MessagePattern('auth.magicLink.send')
async sendMagicLink(
  @Payload() payload: { email: string; callbackUrl: string },
): Promise<{ ok: true }> {
  await this.strategy.sendMagicLink(payload);
  return { ok: true };
}
```
Verbatim from the brief. Confirmed `assignInitialRole()` still calls `this.strategy.setRole(...)` directly (not `this.setRole(...)`), so it's unaffected.

### Step 4 — Confirm MS test passes
```
npx nx test auth -- auth.controller.unit.test.ts
```
Result: **PASS** — 15/15 tests passed.

### Step 5 — Write failing gateway-side test (new file)
Created `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts` verbatim from the brief (2 tests: `setRole()` and `sendMagicLink()` against a mocked `ClientProxy.send` returning `of({ ok: true })`).

### Step 6 — Confirm new test fails
```
npx nx test auth-client -- auth-client.service.unit.test.ts
```
Result: **FAIL** — both tests failed:
```
AssertionError: expected { ok: true } to be undefined
```
This matches the brief's expectation (the mock always emits, so the failure is about `setRole`/`sendMagicLink` resolving with `{ ok: true }` instead of `undefined`, since the current client code returns `firstValueFrom(...)` directly rather than awaiting-and-discarding it).

### Step 7 — Fix the client service
Edited `libs/auth-client/src/lib/auth-client.service.ts`:
```ts
async setRole(uid: string, role: string): Promise<void> {
  await firstValueFrom(this.client.send<{ ok: true }>('auth.setRole', { uid, role }));
}

async sendMagicLink(email: string, callbackUrl: string): Promise<void> {
  await firstValueFrom(
    this.client.send<{ ok: true }>('auth.magicLink.send', { email, callbackUrl }),
  );
}
```
Verbatim from the brief.

### Step 8 — Confirm new test passes
```
npx nx test auth-client -- auth-client.service.unit.test.ts
```
Result: **PASS** — 2/2 tests passed.

## Full-suite regression check (beyond the brief's explicit steps, per task instructions)

```
npx nx test auth
```
Result: **PASS** — 4 test files, 27/27 tests passed (includes supabase/postgres/firebase integration unit tests + the controller unit test file).

```
npx nx test auth-client
```
Result: **PASS** — 1 test file, 2/2 tests passed (this is the only test file in the project — it did not exist before this task).

## Prettier + Lint (per plan's Global Constraints)

```
npx prettier --write apps/microservices/auth/src/app/auth.controller.ts apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
```
Output: `Prettier: All files formatted correctly` (no changes needed — edits already matched Prettier formatting).

```
npx nx lint auth
```
Result: **PASS** — 0 errors.

```
npx nx lint auth-client
```
Result: initially **FAILED** with:
```
/libs/auth-client/package.json
  8:3  error  The "auth-client" project uses the following packages, but they are missing from "dependencies":
    - vitest  @nx/dependency-checks
```

## Deviation from the brief

The brief did not anticipate this lint failure because `libs/auth-client` had **zero test files before this task** — creating the first vitest-importing test file in this library was the first thing to ever trigger the `@nx/dependency-checks` ESLint rule's `**/*.json` check against `libs/auth-client/eslint.config.mjs`, which (unlike sibling libs) had no `ignoredFiles` glob excluding spec/test files from the dependency-declaration check.

I compared against `libs/firebase-admin/eslint.config.mjs`, which already has test files (`firebase-admin.unit.test.ts`) and passes lint cleanly because its config includes:
```js
ignoredFiles: [
  '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
  '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
  '{projectRoot}/src/**/*.{spec,test}.{js,ts,jsx,tsx}',
  '{projectRoot}/src/**/__tests__/**/*.{js,ts,jsx,tsx}',
],
```
I applied the identical two extra glob entries to `libs/auth-client/eslint.config.mjs` (copying the established repo pattern rather than inventing a new one, e.g. adding `vitest` as an explicit runtime dependency, which would be semantically wrong — `vitest` is a test-only tool, not a runtime dependency of the shipped library). Re-ran:
```
npx nx lint auth-client
```
Result: **PASS** — 0 errors.

This fix is in scope (required to satisfy the plan's "0 lint errors" global constraint after adding the test file the brief itself mandates) and minimal (config-only, no behavior change, matches existing precedent elsewhere in the repo).

## Final verification (post-fix)

Re-ran both full suites and both lints once more before committing — all green:
- `npx nx test auth` → 27/27 pass
- `npx nx test auth-client` → 2/2 pass
- `npx nx lint auth` → 0 errors
- `npx nx lint auth-client` → 0 errors

## Files changed

- Modified: `apps/microservices/auth/src/app/auth.controller.ts`
- Modified: `apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts`
- Modified: `libs/auth-client/src/lib/auth-client.service.ts`
- Created: `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`
- Modified (deviation, see above): `libs/auth-client/eslint.config.mjs`

## Commit

```
git commit -m "fix(auth): void MessagePattern handlers crash the TCP client — return {ok:true}"
```
Commit hash: `71ffd75`

Note: no changeset file was added, and no PR was opened — the brief's Step 9 does not mention a changeset, and per the parent task instructions this is task 1 of 3; PR creation (and the `.changeset/` requirement from `AGENTS.md`) is presumed to happen once the full 3-task plan lands, not per-task, unless a later task in this plan says otherwise.
