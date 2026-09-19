### Task 10: `iCore` — trim `useAuthStore`, rewire callback routes

**Files:**

- Modify: `libs/template-shared/src/lib/stores/auth.store.ts`
- Modify: `apps/templates/client-shadcn/src/routes/auth.callback.tsx`
- Modify: `apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx`
- Modify: `apps/templates/client-shadcn/src/routes/login.tsx`
- Test: `apps/templates/client-shadcn/src/routes/__tests__/auth.callback.unit.test.tsx`
- Test: `apps/templates/client-shadcn/src/routes/__tests__/login.unit.test.tsx`

**Interfaces:**

- `useAuthStore.setAuth` signature changes from `{accessToken, refreshToken, user}` to `{user}`.
- Consumes: `setAccessToken` (Task 8/9, from `libs/template-shared/src/lib/api/access-token.ts`).

- [ ] **Step 1: Rewrite `auth.store.ts`**

Replace the entire contents of `libs/template-shared/src/lib/stores/auth.store.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

export interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'icore-auth' },
  ),
);

export function useIsAdmin(): boolean {
  return useAuthStore((s) => s.user?.role === 'admin') ?? false;
}
```

Note: `setAuth` is renamed to `setUser` and no longer takes token fields — every call site across the codebase must be updated in this same task (grep for `useAuthStore.*setAuth\|\.setAuth(` across `apps/templates/client-shadcn/src` before finishing this task and fix every hit, not just the 3 files listed above if more exist).

- [ ] **Step 2: Rewire `auth.callback.tsx`**

Read the current file (it has the `resolveHashSession`/`resolveToken` logic from an earlier, already-merged fix). Replace the `useEffect` body's two `setAuth(hashSession)` / `setAuth(session)` calls: each now becomes `setAccessToken(session.accessToken); setUser(session.user);` (import `setAccessToken` from `libs/template-shared`'s `access-token.ts` re-export, and destructure `setUser` from `useAuthStore` instead of `setAuth`). The existing best-effort `/auth/me` role-backfill block's `setAuth({...hashSession, user: {...}})` call becomes `setUser({ ...hashSession.user, role: me.role })`.

- [ ] **Step 3: Update `auth.callback.unit.test.tsx`**

No changes needed if the existing tests only exercise the pure `resolveHashSession` function (they do, per the file's current content) — confirm this remains true after Step 2's edit; the pure function itself is untouched by this task.

- [ ] **Step 4: Rewire `auth.oauth.callback.tsx`**

Confirmed current content: `const refreshToken = params.get('refreshToken');`, then `if (!accessToken || !refreshToken || !userId || !email) { ... }` (rejects the callback if any is missing), then `setAuth({ accessToken, refreshToken, user: { id: userId, email } })`. Since Task 7 drops `refreshToken` from the redirect fragment entirely, `params.get('refreshToken')` will always resolve `null` — remove the variable, drop it from the `if` guard, and replace the `setAuth(...)` call with `setAccessToken(accessToken); setUser({ id: userId, email });`. Its best-effort role-backfill `setAuth({...})` call (if present further down the file) becomes `setUser({ id: userId, email, role: me.role })`.

- [ ] **Step 5: Rewire `login.tsx`**

In `handlePasswordSubmit` and `handleRegisterSubmit`, both currently do:

```ts
      const session = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', { ... });
      setAuth(session);
```

Change the inline response type to drop `refreshToken` (`{accessToken: string; user: {...}}`), and replace `setAuth(session)` with `setAccessToken(session.accessToken); setUser(session.user);` in both handlers. Import `setAccessToken` and `useAuthStore`'s `setUser` selector at the top (the file already imports `useAuthStore` — just also destructure `setUser` instead of `setAuth`).

- [ ] **Step 6: Update `login.unit.test.tsx`**

Confirm the existing tests only exercise the pure `isSafeReturnTo` function (they do) — no changes needed, same reasoning as Step 3.

- [ ] **Step 7: Run the full `client` and `template-shared` suites**

Run: `yarn nx test client-shadcn` then `yarn nx test template-shared`
Expected: PASS. Fix any remaining `setAuth`/`accessToken`/`refreshToken` store references this task's grep in Step 1 turned up but weren't explicitly listed here.

- [ ] **Step 8: Format, lint, build**

```bash
npx prettier --write libs/template-shared/src/lib/stores/auth.store.ts apps/templates/client-shadcn/src/routes/auth.callback.tsx apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx apps/templates/client-shadcn/src/routes/login.tsx
yarn nx lint client-shadcn && yarn nx lint template-shared
yarn nx build client-shadcn && yarn nx build template-shared
```

- [ ] **Step 9: Commit**

```bash
git add libs/template-shared/src/lib/stores/auth.store.ts apps/templates/client-shadcn/src/routes/auth.callback.tsx apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx apps/templates/client-shadcn/src/routes/login.tsx
git commit -m "feat(client): trim useAuthStore to user-only, rewire callback routes onto in-memory access token"
```

---
