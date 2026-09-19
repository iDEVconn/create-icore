### Task 12: `iCore` — wire logout to the new endpoint

**Files:**

- Modify: `apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx`
- Test: `apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx` (new — no `.unit.test.tsx` files exist anywhere in this repo yet, per Task 11's same finding; there is no existing convention to mirror, use `@testing-library/react`'s standard `render`/`screen`/`fireEvent` directly).

**Interfaces:**

- Consumes: `api` (existing `POST` call, exported from `apps/templates/client-shadcn/src/main.tsx` — there is no separate `apps/templates/client-shadcn/src/lib/api.ts` file; other consumers import it via `import { api } from '../../main'`, per `queries/notes.ts`), `setAccessToken` (Task 8/9).

- [ ] **Step 1: Write the failing test**

Create `apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx` with a test asserting: clicking the logout menu item calls `POST /auth/logout` (mock the `../../../main` module's `api` export, since that's where `LayoutHeader.tsx` will import it from), then clears `useAuthStore`'s `user` and the in-memory access token, then navigates to `/login`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test client-shadcn -t "LayoutHeader"` (or `-t "logout"`, whichever matches the new test's description)
Expected: FAIL.

- [ ] **Step 3: Rewire `handleLogout`**

In `apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx`, find:

```ts
function handleLogout() {
  logout();
  void navigate({ to: '/login' });
}
```

Replace with:

```ts
async function handleLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // Best-effort: clear local state and navigate regardless — an already-
    // expired/invalid session shouldn't block the user from reaching /login.
  }
  setAccessToken(null);
  logout();
  void navigate({ to: '/login' });
}
```

Update the `onClick={handleLogout}` call site (currently `onClick={handleLogout}` on a plain function — confirm it still works being `async` now; React's `onClick` accepts a function returning `void | Promise<void>` fine, but if this codebase's lint rules flag unawaited promises in JSX handlers, wrap the call site as `onClick={() => void handleLogout()}` instead, matching the pattern already used for `onClick={() => void navigate(...)}` elsewhere in this same file).

Add `import { api } from '../../main';` (matching this repo's existing `queries/notes.ts` convention for importing the shared client instance) and `import { setAccessToken } from '@icore/template-shared';` (`setAccessToken` is already re-exported per Task 8 Step 13) at the top of the file if not already present.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test client-shadcn -t "LayoutHeader"` (or the matching filter from Step 2)
Expected: PASS.

- [ ] **Step 5: Format, lint, build**

```bash
npx prettier --write apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx
yarn nx lint client-shadcn
yarn nx build client-shadcn
```

- [ ] **Step 6: Commit**

```bash
git add apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx
git commit -m "feat(client): call POST /auth/logout before clearing local session state"
```

---
