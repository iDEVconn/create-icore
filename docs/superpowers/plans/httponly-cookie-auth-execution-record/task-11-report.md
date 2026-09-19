# Task 11 Report — `AuthBootstrap` silent-refresh-on-boot

## What was implemented

1. **`apps/templates/client-shadcn/src/app/auth-bootstrap.tsx`** (new) — matches the brief exactly:
   - `AuthBootstrap({ children })` holds a `booted` boolean state, calls `performSilentRefresh(import.meta.env.VITE_API_URL ?? '/api')` in a `useEffect` on mount, guards against unmount races with a `cancelled` flag, calls `setUser(result.user)` on success, and always flips `booted = true` in the `.then()` regardless of success/failure.
   - While `!booted`, renders a full-screen centered `Loader2` spinner (`bg-background`/`text-muted-foreground` tokens, matching the app's existing Tailwind style).
   - Once booted, renders `children` verbatim (`<>{children}</>`).

2. **`apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx`** (new) — the two tests from the brief, with one necessary adaptation (see below).

3. **`apps/templates/client-shadcn/src/main.tsx`** (modified) — added the `AuthBootstrap` import and wrapped it around `RouterProvider` + `Toaster` inside `AbilityProvider`, preserving `OfflineBanner`/`UpdatePrompt` as direct siblings of `AuthBootstrap` (not nested inside it).

## Judgment call: OfflineBanner / UpdatePrompt placement

Kept **outside** `AuthBootstrap`'s children — i.e. still direct children of `AbilityProvider`, rendered unconditionally regardless of boot state:

```tsx
<AbilityProvider>
  <OfflineBanner />
  <AuthBootstrap>
    <RouterProvider router={router} />
    <Toaster richColors />
  </AuthBootstrap>
  <UpdatePrompt />
</AbilityProvider>
```

Reasoning: both are global chrome elements with no auth dependency.

- `OfflineBanner` reports network connectivity — a user who's offline should see that banner immediately, including during the ~1 refresh-call boot window (and especially useful if the silent refresh itself is failing _because_ the network is down — the banner explains why the app looks stuck).
- `UpdatePrompt` is a PWA update notification, orthogonal to auth entirely; there's no reason to delay it behind the boot gate.

Neither depends on the router or auth state, so nesting them inside `AuthBootstrap` would only delay their first paint for no benefit.

## TDD evidence

**RED** — `yarn nx test client-shadcn -t "AuthBootstrap"` before `auth-bootstrap.tsx` existed:

```
FAIL  client-shadcn  src/app/__tests__/auth-bootstrap.unit.test.tsx
Error: Failed to resolve import "../auth-bootstrap" from ".../auth-bootstrap.unit.test.tsx". Does the file exist?
```

Confirmed failing for the right reason (missing module), not a config/setup issue.

**Adaptation required before GREEN:** ran the test again after adding it verbatim from the brief (component still missing) — no change there — but once the component was implemented, the brief's literal test code (`.toBeInTheDocument()` / `.not.toBeInTheDocument()`) failed with:

```
Error: Invalid Chai property: toBeInTheDocument
```

Verified `@testing-library/jest-dom` is **not** installed anywhere in this repo (checked root `package.json`, `yarn.lock`, and `node_modules/@testing-library/` — only `dom` and `react` present, no `jest-dom`, no vitest setup file registering custom matchers anywhere in the workspace). Since this is the first `.unit.test.tsx` component-render test in the repo and installing a new dependency is out of scope (would require touching `package.json`/`yarn.lock`, outside this task's file scope), I adapted the two assertions to use vanilla Vitest/Chai matchers with identical test semantics:

- `expect(screen.queryByText(...)).not.toBeInTheDocument()` → `expect(screen.queryByText(...)).toBeNull()`
- `await waitFor(() => expect(screen.getByText(...)).toBeInTheDocument())` → `await waitFor(() => expect(screen.getByText(...)).toBeTruthy())`

`getByText` throws if the element isn't found (so `waitFor` retries until it exists — using `.toBeTruthy()` on its result is a no-op sanity check that preserves the "assert it exists" intent), and `queryByText` returns `null` when absent. No other test logic changed. All mocking (`vi.mock('@icore/template-shared', ...)` mocking only `performSilentRefresh`, `useAuthStore.setState({ user: null })` reset in `beforeEach`) is unchanged from the brief.

**GREEN** — `yarn nx test client-shadcn -t "AuthBootstrap"`:

```
✓ client-shadcn  src/app/__tests__/auth-bootstrap.unit.test.tsx (2 tests) 48ms

Test Files  5 passed (5)
     Tests  12 passed (12)
```

No `@vitest-environment jsdom` docblock was needed — confirmed `libs/vite-plugins/src/index.mjs`'s `commonTestConfig()` already sets `environment: 'jsdom'` for `client-shadcn`. No act() warnings in the final run.

## Full `client-shadcn` suite result

`yarn nx test client-shadcn` (no `-t` filter):

```
✓ src/app/app.spec.tsx (1 test)
✓ src/components/pwa/__tests__/UpdatePrompt.spec.tsx (2 tests)
✓ src/components/pwa/__tests__/OfflineBanner.spec.tsx (3 tests)
✓ src/app/__tests__/auth-bootstrap.unit.test.tsx (2 tests)
✓ src/components/auth/__tests__/LoginForm.spec.tsx (4 tests)

Test Files  5 passed (5)
     Tests  12 passed (12)
```

No regressions. (One pre-existing, unrelated `react-i18next` stderr warning in `LoginForm.spec.tsx` — not introduced by this change.)

## Prettier / lint / build

- `npx prettier --write` on the 3 touched files — `auth-bootstrap.tsx` and `main.tsx` were already formatted (unchanged); the test file got a minor reflow.
- `yarn nx lint client-shadcn` — **0 errors**, 1 pre-existing warning (`@typescript-eslint/no-non-null-assertion` on `main.tsx:50`, on the pre-existing `document.getElementById('root')!` line, untouched by this change).
- `yarn nx run client-shadcn:vite:build` (the real target — plain `build` doesn't exist for this project) — succeeded, PWA precache generated, no errors.

## Files changed

- `/home/vladimir-tkach/Projects/22/apps/templates/client-shadcn/src/app/auth-bootstrap.tsx` (new)
- `/home/vladimir-tkach/Projects/22/apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx` (new)
- `/home/vladimir-tkach/Projects/22/apps/templates/client-shadcn/src/main.tsx` (modified)

Committed as `1b6820b` — "feat(client): add AuthBootstrap silent-refresh-on-boot wrapper".

Note: `tools/create-icore/templates/apps/templates/client-shadcn/src/main.tsx` is a generated build artifact (per prior team convention) and was intentionally left untouched — it wasn't in `git status` as needing sync and isn't part of this task's scope.

## Self-review

- **Completeness:** Loading state renders before resolution (spinner, no children) in both success and failure paths; children render after resolution in both paths. Both paths assert on `useAuthStore.getState().user` (populated vs. still null). Matches brief intent fully.
- **Quality:** Component matches existing app style — Tailwind utility classes consistent with other full-screen states in the app (`bg-background`, `text-muted-foreground`), `lucide-react`'s `Loader2` (already a dependency), same effect-with-cancelled-flag pattern used elsewhere in the codebase for async-in-effect safety.
- **Discipline:** No scope creep — `_dashboard.tsx` was not touched. Only the 3 files listed above changed. No package.json/yarn.lock edits despite the jest-dom gap (adapted the test instead of expanding scope).
- **Testing:** Uses real `@testing-library/react` `render`/`screen`/`waitFor`; only `performSilentRefresh` is mocked (via `vi.mock` + `vi.importActual` spread, per the brief) — `useAuthStore` itself is the real store, reset via `setState` in `beforeEach`. Output is pristine on the new test file (no warnings).

## Concerns

- The brief's literal test code assumes `@testing-library/jest-dom` matchers (`toBeInTheDocument`) are available; they are not installed anywhere in this repo. I substituted equivalent plain-Chai assertions (`toBeNull()` / `toBeTruthy()`) rather than adding a new dependency, since that would exceed this task's file scope. If the team wants `jest-dom` as a standing convention for future component tests, that's a separate, cross-cutting decision (new devDependency + a vitest setup file) — flagging it here rather than deciding it unilaterally.
- No other concerns. Task 10's `_dashboard.tsx` guard will now see a populated `getAccessToken()` before routes render, since `AuthBootstrap` runs before `RouterProvider` mounts children into the tree — closing the "reload kicks authenticated user to /login" gap this task targeted.
