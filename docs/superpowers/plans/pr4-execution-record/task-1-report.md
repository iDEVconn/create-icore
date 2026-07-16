# Task 1 Report: Gate OAuth buttons + magic-link toggle on provider capability

## Summary

Implemented the brief exactly as written, with two deviations (both diagnosed via systematic debugging, documented below). All steps in the brief were followed in order: write failing generator test → confirm fail → implement → confirm pass → full-suite regression check → write failing component test → confirm fail → implement → confirm pass → full-suite regression check → doc update → build verification → prettier/lint → commit.

## Files changed

- `tools/create-icore/src/lib/scaffold-env.ts` — added `OAUTH_MAGIC_LINK_PROVIDERS` set (`supabase`, `firebase`) and changed `writeClientEnv(targetDir, opts)` to append `VITE_AUTH_HAS_OAUTH`/`VITE_AUTH_HAS_MAGIC_LINK` to the generated client `.env`, derived from `opts.authProvider`.
- `tools/create-icore/src/lib/scaffold.ts:192` — call site updated to `writeClientEnv(opts.targetDir, opts)`.
- `tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts` — new, verbatim from brief.
- `apps/templates/client-shadcn/src/components/auth/LoginForm.tsx` — added module-level `AUTH_HAS_OAUTH` / `AUTH_HAS_MAGIC_LINK` constants read from `import.meta.env`; wrapped the OAuth divider+button grid and the magic-link toggle button in `{AUTH_HAS_OAUTH && (...)}` / `{AUTH_HAS_MAGIC_LINK && (...)}`. Email/password form and register-switch link unchanged.
- `apps/templates/client-shadcn/src/components/auth/__tests__/LoginForm.spec.tsx` — new (adapted from brief, see deviations below).
- `apps/templates/client-shadcn/.env.example` — appended `VITE_AUTH_HAS_OAUTH=false` / `VITE_AUTH_HAS_MAGIC_LINK=false` with explanatory comment.

No package.json/yarn.lock changes were needed — all test deps (`@testing-library/react`, `vitest`, etc.) were already present and root-hoisted. Verified via `git status --short` that only the six files above changed; no lockfile diff.

## Deviations from the brief (with reasoning)

1. **Removed unused `beforeEach` import in `LoginForm.spec.tsx`.** The brief's Step 6 snippet imports `beforeEach` from `vitest` but never calls it. The repo's root ESLint config sets `@typescript-eslint/no-unused-vars` to `error` (`eslint.config.mjs:16`), so keeping it verbatim would have failed `nx lint client-shadcn`. Dropped the import; no behavior change, same test intent.

2. **Replaced `@testing-library/jest-dom`'s `toBeInTheDocument()` matcher with built-in vitest/chai assertions.** Running the brief's test verbatim failed with `Error: Invalid Chai property: toBeInTheDocument` — not the expected "buttons still render" failure. Diagnosed: `@testing-library/jest-dom` is not installed anywhere in the repo (checked root `package.json` deps, root `node_modules/@testing-library/` — only `dom` and `react` are present, no `jest-dom`; also confirmed no `setupFiles`/`expect.extend` registers those matchers anywhere in `vite-plugins`' `commonTestConfig`, and no other spec file in the repo uses `toBeInTheDocument`). Since the task brief explicitly says this task "most likely does NOT need" a new dependency and instructs to verify before touching `yarn.lock`, and since dropping jest-dom entirely preserves the exact same assertion intent (presence/absence of the Google/GitHub buttons and the magic-link toggle), I adapted the assertions to:
   - `expect(screen.queryByText(...)).toBeNull()` (was `.not.toBeInTheDocument()`)
   - `expect(screen.getByText(...)).toBeDefined()` (was `.toBeInTheDocument()`) — `getByText` already throws if the element is absent, so this assertion is belt-and-suspenders on top of that throw-based check.

   The brief's `vi.stubEnv` + `vi.resetModules()` + dynamic `import()` mechanism for re-evaluating the module-level `AUTH_HAS_OAUTH`/`AUTH_HAS_MAGIC_LINK` constants worked exactly as written — no adaptation needed there. Confirmed by running the "hides" test in isolation both before and after the `LoginForm.tsx` fix: it failed for the right reason pre-fix (buttons still rendered unconditionally) and passed post-fix.

3. **Step 12 build command name.** The brief says `npx nx build client-shadcn`, but `client-shadcn` has no `build` target — Nx's `@nx/vite` plugin infers it as `vite:build` (confirmed via `npx nx show project client-shadcn --json`). Ran `npx nx run client-shadcn:vite:build` instead; build succeeded (218 modules transformed, all chunks emitted, no errors).

## Test commands run (in order) and output

1. `npx nx test create-icore -- scaffold-env.unit.test.ts` (before fix) → **FAIL** (4/4 failing — `.env` only contained `VITE_API_URL=/api`, no `VITE_AUTH_HAS_*` vars), matching brief's expected failure.
2. Implemented `scaffold-env.ts` + `scaffold.ts` changes.
3. `npx nx test create-icore -- scaffold-env.unit.test.ts` → **PASS** (4/4).
4. `npx nx test create-icore` (full suite) → **PASS** (175/175 across 16 test files).
5. `npx nx test client-shadcn -- LoginForm.spec.tsx` (brief's verbatim test) → **FAIL**, but for the wrong reason (`Invalid Chai property: toBeInTheDocument` — missing jest-dom). Adapted assertions (see deviation #2).
6. `npx nx test client-shadcn -- LoginForm.spec.tsx` (adapted, before `LoginForm.tsx` fix) → **FAIL** (1/2 — "hides" test failed because the Google button was still rendered; "shows" test passed trivially since nothing was gated yet). This matches the brief's expected failure reasoning.
7. Implemented `LoginForm.tsx` JSX gating.
8. `npx nx test client-shadcn -- LoginForm.spec.tsx` → **PASS** (2/2).
9. `npx nx test client-shadcn` (full suite) → **PASS** (3/3 — `app.spec.tsx` + both new `LoginForm.spec.tsx` cases).
10. `npx nx run client-shadcn:vite:build` → **PASS** (green build, 425ms, no errors).
11. `npx prettier --write <all 6 touched files>` → all TS/TSX files reported "unchanged" (already correctly formatted); `.env.example` reported "No parser could be inferred" — expected/harmless, `.env` files aren't in the repo's `lint-staged` glob (`*.json`, `*.{js,ts,jsx,tsx}` only) and prettier has no built-in `.env` parser.
12. `npx nx lint create-icore` → **PASS**, 0 errors, 0 warnings.
13. `npx nx lint client-shadcn` → **PASS**, 0 errors, 1 pre-existing warning in `src/main.tsx:47` (`@typescript-eslint/no-non-null-assertion`) unrelated to this change.

## Commit

Committed all 6 files with message `fix(client): gate OAuth buttons + magic-link toggle on provider capability`. Commit hash recorded in the final status line back to the orchestrator.

## Task 2: Mixed-flag test coverage enhancement

**Finding:** The two existing test cases in `LoginForm.spec.tsx` always set `VITE_AUTH_HAS_OAUTH` and `VITE_AUTH_HAS_MAGIC_LINK` to the SAME value (both false, or both true). A bug that swapped which constant gates which JSX block would not be caught by the existing suite.

**Fix:** Added two new test cases to the same `describe` block in `apps/templates/client-shadcn/src/components/auth/__tests__/LoginForm.spec.tsx`:

1. Test: "shows OAuth buttons but hides magic-link toggle when only OAuth is supported"
   - `VITE_AUTH_HAS_OAUTH=true`, `VITE_AUTH_HAS_MAGIC_LINK=false`
   - Assert: Google/GitHub buttons present (`.toBeDefined()`), magic-link toggle absent (`.toBeNull()`)

2. Test: "hides OAuth buttons but shows magic-link toggle when only magic-link is supported"
   - `VITE_AUTH_HAS_OAUTH=false`, `VITE_AUTH_HAS_MAGIC_LINK=true`
   - Assert: Google/GitHub buttons absent (`.toBeNull()`), magic-link toggle present (`.toBeDefined()`)

Both follow the existing test pattern: `vi.stubEnv()` → `vi.resetModules()` → dynamic `import()` → render + assert. Used the same assertion style already in the file (no `toBeInTheDocument()`).

**Test results:**
- `npx nx test client-shadcn -- LoginForm.spec.tsx` → **PASS** (4/4 tests: 2 original + 2 new)
- `npx nx lint client-shadcn` → **PASS** (0 errors, 1 pre-existing warning unrelated to test file)
- `npx prettier --write ...LoginForm.spec.tsx` → all files formatted correctly

**Commit:** `841eb4b` — test(LoginForm): add mixed-flag gating coverage for OAuth and magic-link
