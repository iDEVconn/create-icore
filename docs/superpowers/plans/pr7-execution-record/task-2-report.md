# Task 2 Report: Gate `client-mui`'s `LoginForm`

## Summary

Gated the Google/GitHub OAuth `Button`s and the magic-link toggle `Box` in
`apps/templates/client-mui/src/components/auth/LoginForm.tsx` behind two
build-time env flags (`VITE_AUTH_HAS_OAUTH`, `VITE_AUTH_HAS_MAGIC_LINK`),
mirroring the fix already shipped for `client-shadcn`. Wrote a 4-case
component test matrix that exercises all four combinations of the two flags.
Followed the brief's code and test content verbatim — no deviations were
needed.

## What was done, in order

1. Read the brief at `.superpowers/sdd/task-2-brief.md` and the current
   `LoginForm.tsx` — confirmed the file matched the brief's described
   "before" state exactly (unconditional OAuth buttons at lines 60-77,
   unconditional magic-link `Box` at lines 126-137).
2. Confirmed clean baseline: `git status` clean, branch
   `bug/mui-antd-oauth-gating`, HEAD at `764ae28` (Task 1's commit).
3. Created `apps/templates/client-mui/src/components/auth/__tests__/`
   (did not exist yet) and wrote
   `apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx`
   with the exact 4-case test content from the brief (hides-both,
   shows-both, oauth-only, magic-link-only), including the `vi.mock('@/main', ...)`
   and `vi.mock('@tanstack/react-router', ...)` mocks required to avoid
   executing the real `main.tsx` side effects (`createRoot(...).render(...)`,
   `createRouter(...)`).
4. Ran the test to confirm it fails pre-fix (Step 2 of the brief).
5. Gated the JSX in `LoginForm.tsx`: added the two `const AUTH_HAS_OAUTH` /
   `const AUTH_HAS_MAGIC_LINK` module-level constants, wrapped the OAuth
   button `Stack` + `Divider` in `{AUTH_HAS_OAUTH && (<>...</>)}`, and
   wrapped the magic-link `Box` in `{AUTH_HAS_MAGIC_LINK && (...)}` — exactly
   as shown in the brief's Step 3 code block.
6. Ran the test to confirm it passes (Step 4).
7. Ran the full `client-mui` test suite to confirm no regression against the
   pre-existing `app.spec.tsx` (Step 5).
8. Ran `npx nx show project client-mui --json` to confirm the real build
   target name before assuming `build` — confirmed it is `vite:build` (same
   as `client-shadcn`'s target from Task 1/PR4).
9. Ran `npx nx run client-mui:vite:build` to build-verify (Step 6).
10. Ran `npx prettier --write` on both touched files, then
    `npx nx lint client-mui` (Step 7 prep).
11. Verified `git branch --show-current` was still
    `bug/mui-antd-oauth-gating` and reviewed the full diff before staging,
    to guard against the known subagent shared-worktree drift issue.
12. Committed both files with the exact message from the brief.
13. Re-verified after a "you got cut off" nudge from the coordinator: re-ran
    `git show d7e9bee --stat` and `npx nx test client-mui` to confirm the
    commit contents and passing test suite were still intact (this report
    step) — both matched expectations, no drift.

## Exact commands run and their outcomes

### Step 2 — test fails pre-fix

```
npx nx test client-mui -- LoginForm.spec.tsx
```
First attempt hit the known environment issue:
```
NX   failed to register initial watches: OS file watch limit reached. about ["/home/.../.claude/hooks"]
```
Retried per the task instructions with `NX_DAEMON=false`:
```
NX_DAEMON=false npx nx test client-mui -- LoginForm.spec.tsx
```
Result: **3 of 4 tests FAILED** (as expected — the "shows OAuth + magic-link
when supported" case passes vacuously against the unconditional pre-fix
markup; the other three, which expect elements to be absent, fail because
the buttons/toggle render unconditionally):
```
FAIL src/components/auth/__tests__/LoginForm.spec.tsx > ... > hides OAuth buttons and magic-link toggle when the provider supports neither
  AssertionError: expected <button> to be null
FAIL src/components/auth/__tests__/LoginForm.spec.tsx > ... > OAuth-only: shows the buttons, hides the magic-link toggle
  AssertionError: expected <span>auth.withMagicLink</span> to be null
FAIL src/components/auth/__tests__/LoginForm.spec.tsx > ... > magic-link-only: hides the buttons, shows the magic-link toggle
  AssertionError: expected <button> to be null
Failed tasks: client-mui:test
```

### Step 4 — test passes post-fix

```
NX_DAEMON=false npx nx test client-mui -- LoginForm.spec.tsx
```
Result: **PASS, 4/4**
```
✓ |client-mui| src/components/auth/__tests__/LoginForm.spec.tsx (4 tests) 752ms
Test Files  1 passed (1)
     Tests  4 passed (4)
NX   Successfully ran target test for project client-mui
```

### Step 5 — full suite, no regression

```
NX_DAEMON=false npx nx test client-mui
```
Result: **PASS, 6/6** (2 pre-existing `app.spec.tsx` + 4 new)
```
✓ |client-mui| src/app/app.spec.tsx (2 tests) 19ms
✓ |client-mui| src/components/auth/__tests__/LoginForm.spec.tsx (4 tests) 816ms
Test Files  2 passed (2)
     Tests  6 passed (6)
NX   Successfully ran target test for project client-mui
```

### Step 6 — confirm real build target, build-verify

```
NX_DAEMON=false npx nx show project client-mui --json > /tmp/.../client-mui-show.json
python3 -c "import json; d=json.load(open(...)); print(list(d.get('targets',{}).keys()))"
```
Output: `['vite:build', 'serve', 'vite:dev', 'vite:preview', 'serve-static', 'typecheck', 'build-deps', 'watch-deps', 'test', 'lint', ...]`

Confirmed real target is **`vite:build`** (not `build`), matching
`client-shadcn`'s target from the prior PR.

```
NX_DAEMON=false npx nx run client-mui:vite:build
```
Result: **green** — `✓ built in 331ms`, `NX Successfully ran target vite:build for project client-mui`.

### Step 7 — prettier, lint, commit

```
npx prettier --write apps/templates/client-mui/src/components/auth/LoginForm.tsx apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx
```
Result: `Prettier: All files formatted correctly` (no changes needed — content
was already brief-formatted).

```
NX_DAEMON=false npx nx lint client-mui
```
Result: **0 errors, 1 pre-existing warning** unrelated to touched files
(`main.tsx:57` — `Forbidden non-null assertion`, pre-existing, not introduced
by this change).

```
git add apps/templates/client-mui/src/components/auth/LoginForm.tsx apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx
git commit -m "fix(client): gate mui LoginForm's OAuth buttons + magic-link toggle on provider capability"
```
Commit created: **`d7e9bee`**
```
d7e9bee fix(client): gate mui LoginForm's OAuth buttons + magic-link toggle on provider capability
 2 files changed, 108 insertions(+), 35 deletions(-)
 create mode 100644 apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx
```

### Post-hoc re-verification (after coordinator nudge)

```
git show d7e9bee --stat
```
Confirmed both files present in the commit as expected:
```
.../client-mui/src/components/auth/LoginForm.tsx   | 79 ++++++++++++----------
.../components/auth/__tests__/LoginForm.spec.tsx   | 64 ++++++++++++++++++
 2 files changed, 108 insertions(+), 35 deletions(-)
```

```
NX_DAEMON=false npx nx test client-mui
```
Result: **PASS, 6/6** (served from Nx local cache since no relevant inputs
changed since the last green run):
```
✓ |client-mui| src/app/app.spec.tsx (2 tests) 19ms
✓ |client-mui| src/components/auth/__tests__/LoginForm.spec.tsx (4 tests) 816ms
Test Files  2 passed (2)
     Tests  6 passed (6)
Nx read the output from the cache instead of running the command for 1 out of 1 tasks.
```
No drift — the commit and passing state from earlier in the session were
still intact.

## Deviations from the brief

None. The brief's test file content, the `LoginForm.tsx` gating code, and
the commit message were all used verbatim as written. The only judgment
calls were:
- Retrying `nx test`/`nx run` with `NX_DAEMON=false` on the first "OS file
  watch limit reached" error, exactly as flagged as an expected possibility
  in the task instructions.
- Confirming the real build target via `nx show project --json` rather than
  assuming `build`, per the brief's explicit Step 6 instruction — confirmed
  `vite:build`, consistent with the `client-shadcn` precedent from PR4/Task 1.

## Files touched

- Modified: `apps/templates/client-mui/src/components/auth/LoginForm.tsx`
- Created: `apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx`

## Commit

`d7e9bee` — `fix(client): gate mui LoginForm's OAuth buttons + magic-link toggle on provider capability`
