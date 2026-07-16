# Task 3 Report: Gate `client-antd`'s `LoginForm`

## Summary

Applied the same provider-capability gating pattern used for `client-mui` (Task 2) to the antd template's `LoginForm`. OAuth buttons (`Google`/`GitHub`) are now gated behind `VITE_AUTH_HAS_OAUTH`, and the magic-link toggle is gated behind `VITE_AUTH_HAS_MAGIC_LINK`, both read from `import.meta.env` at module scope exactly as in the brief.

Status: **DONE**

## What was done

1. Confirmed baseline `apps/templates/client-antd/src/components/auth/LoginForm.tsx` matched the brief's described pre-fix state exactly (OAuth buttons at lines ~53-68, magic-link `Typography.Link` at ~110-112, both unconditional).
2. Wrote the failing test file `apps/templates/client-antd/src/components/auth/__tests__/LoginForm.spec.tsx` with the 4 cases from the brief verbatim (hides-both, shows-both, oauth-only, magic-link-only), including the `vi.mock('@/main', ...)` and `vi.mock('@tanstack/react-router', ...)` mocks.
3. Ran the test — it failed, but for the wrong reason (see Deviation below). Diagnosed and fixed the test infra, then reran to confirm it failed for the *correct* reason (unconditional rendering, pre-gating).
4. Applied the exact JSX gating from the brief to `LoginForm.tsx`:
   - Added `AUTH_HAS_OAUTH` / `AUTH_HAS_MAGIC_LINK` module-level consts reading `import.meta.env.VITE_AUTH_HAS_OAUTH` / `VITE_AUTH_HAS_MAGIC_LINK`.
   - Wrapped the OAuth `Space` + `Divider` block in `{AUTH_HAS_OAUTH && (<>...</>)}`.
   - Wrapped the magic-link `Typography.Link` in `{AUTH_HAS_MAGIC_LINK && (...)}`.
5. Reran the test — 4/4 passed.
6. Ran the full `client-antd` suite — 2 test files, 5 tests, all passed (no regression against the pre-existing `app.spec.tsx`).
7. Confirmed the real build target via `npx nx show project client-antd --json`: **`vite:build`** (same as `client-mui`, as expected — not assumed, verified).
8. Build-verified via `npx nx run client-antd:vite:build` — green (only a pre-existing, unrelated "chunk larger than 500kB" warning for the antd vendor bundle).
9. Ran `npx prettier --write` on both touched files — already formatted correctly, no changes.
10. Ran `npx nx lint client-antd` — 0 errors, 1 pre-existing warning in `main.tsx` (`no-non-null-assertion`) unrelated to this change.
11. Committed both files in a single commit.

## Exact commands run and output

```
$ NX_DAEMON=false npx nx test client-antd -- LoginForm.spec.tsx     # before matchMedia fix
...
TypeError: window.matchMedia is not a function
 ❯ node_modules/antd/lib/_util/responsiveObserver.js:104:30
Test Files  1 failed (1)
     Tests  4 failed (4)

$ NX_DAEMON=false npx nx test client-antd -- LoginForm.spec.tsx     # after matchMedia fix, before JSX gating
Test Files  1 failed (1)
     Tests  3 failed | 1 passed (4)
# Failures were the expected ones: "hides-both" and "magic-link-only" and "oauth-only" failed
# because auth.continueWithGoogle / auth.withMagicLink rendered unconditionally.
# "shows-both" passed (nothing to hide yet).

$ NX_DAEMON=false npx nx test client-antd -- LoginForm.spec.tsx     # after JSX gating
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ NX_DAEMON=false npx nx test client-antd                            # full suite
 Test Files  2 passed (2)
      Tests  5 passed (5)

$ NX_DAEMON=false npx nx show project client-antd --json | grep -o '"vite:build":{...}'
# confirmed target name: "vite:build" (executor nx:run-commands, command "vite build")

$ NX_DAEMON=false npx nx run client-antd:vite:build
✓ built in 1.32s
 NX   Successfully ran target vite:build for project client-antd
# (only warning: "Some chunks are larger than 500 kB after minification" — pre-existing, antd vendor chunk, unrelated)

$ npx prettier --write apps/templates/client-antd/src/components/auth/LoginForm.tsx apps/templates/client-antd/src/components/auth/__tests__/LoginForm.spec.tsx
Prettier: All files formatted correctly

$ NX_DAEMON=false npx nx lint client-antd
.../apps/templates/client-antd/src/main.tsx
  53:12  warning  Forbidden non-null assertion  @typescript-eslint/no-non-null-assertion
✖ 1 problem (0 errors, 1 warning)
 NX   Successfully ran target lint for project client-antd
```

Also hit `OS file watch limit reached` on the very first bare `npx nx test` invocation (multiple concurrent worktrees in this environment) — resolved per the brief's guidance by prefixing `NX_DAEMON=false` on every subsequent `nx test`/`nx run`/`nx show`/`nx lint` call.

## Deviation from the brief (and why)

**Issue:** Running the brief's test file verbatim against the un-gated `LoginForm.tsx` did not fail with the expected assertion mismatches. Instead, all 4 tests crashed during React's effect-commit phase with:

```
TypeError: window.matchMedia is not a function
 ❯ node_modules/antd/lib/_util/responsiveObserver.js:104:30
 ❯ node_modules/antd/lib/grid/hooks/useBreakpoint.js:18:38
```

**Root cause:** antd's `Space` component (and its `Grid`/`useBreakpoint` responsive machinery) calls `window.matchMedia` under the hood. The workspace's shared Vitest config (`commonTestConfig` in `libs/vite-plugins/src/index.mjs`) sets `environment: 'jsdom'` with no `setupFiles` and no `matchMedia` polyfill anywhere in the repo (`grep -ri matchMedia` across the workspace returned nothing). jsdom does not implement `window.matchMedia` by default, so any test that renders an antd component using `Space`/`Grid` crashes before it ever reaches an assertion.

This is a genuinely antd-specific gap: `client-mui`'s `LoginForm` (Task 2) doesn't use any MUI component whose behavior depends on `window.matchMedia` (confirmed via `grep -n "Grid\|useMediaQuery\|useBreakpoint"` on its `LoginForm.tsx` → no matches), so Task 2 never hit this. The only pre-existing test in `client-antd` (`src/app/app.spec.tsx`) renders a trivial welcome page, not a real antd form, so this is the first test in the template to exercise antd's responsive hooks — nobody had hit the gap before.

**Fix:** Added a standard `window.matchMedia` polyfill (the same jsdom-shim pattern widely used for antd/MUI component testing) inside a `beforeAll` in the new spec file only:

```tsx
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});
```

Kept the fix local to `LoginForm.spec.tsx` rather than touching the shared `libs/vite-plugins` test config, since:
- It's out of scope for a "gate LoginForm" task to modify shared test infra used by all templates (`client-mui`, `client-shadcn`, `client-antd`).
- It doesn't regress or change behavior for any other test — `app.spec.tsx` still passes unmodified.
- If a future antd component test hits the same gap, promoting this polyfill to a shared `setupFiles` entry in `libs/vite-plugins` would be the natural follow-up, but that's a separate, broader change not covered by this task.

No other deviations. All test assertions, the JSX gating logic, and the commit message are verbatim from the brief.

## Files touched

- `apps/templates/client-antd/src/components/auth/LoginForm.tsx` (modified — gated JSX)
- `apps/templates/client-antd/src/components/auth/__tests__/LoginForm.spec.tsx` (created — 4-case test suite + matchMedia polyfill)

## Commit

`15c5d53` — `fix(client): gate antd LoginForm's OAuth buttons + magic-link toggle on provider capability`
