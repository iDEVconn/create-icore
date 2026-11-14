# Task 5 report
Built identical `src/queries/profile.ts` (md5 equal) in client-{shadcn,antd,mui}: `Profile {uid,email,role?: string|null}`, `useProfile()` (GET /profile, key ['profile']), `useUpdateProfile()` (PATCH /profile {name}, JSON header; onSuccess notify 'Saved' + invalidate ['profile']; onError notify message/'save_failed'). Pages now use hooks; `setDirty(false)` via `mutate(name,{onSuccess})`; unused `notify` removed from pages. UI unchanged.
Tests: identical `queries/__tests__/profile.unit.test.ts` (3 tests) in all three.
RED: `npx vitest run --root apps/templates/client-<ui> src/queries/__tests__/profile.unit.test.ts` -> "Failed to resolve import ../profile" (all three).
GREEN: 3 passed per template. `yarn nx run-many -t lint test build -p ...` 6 tasks succeeded.
tsc: no errors in new/changed files except pre-existing: client-mui profile.tsx `inputProps` TS2322 (line unchanged; mui typecheck is broken repo-wide), shadcn `virtual:pwa-register/react` missing. antd clean.
Concerns: nx ran only 6 tasks (build target may not be inferred as named); templates/ drift none observed.
