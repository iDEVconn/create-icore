### Task 11: `iCore` — `AuthBootstrap` silent-refresh-on-boot

**Files:**

- Create: `apps/templates/client-shadcn/src/app/auth-bootstrap.tsx`
- Test: `apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx`
- Modify: `apps/templates/client-shadcn/src/main.tsx`

**Interfaces:**

- Consumes: `performSilentRefresh` (Task 8), `useAuthStore.setUser` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as silentRefresh from '@icore/template-shared';
import { useAuthStore } from '@icore/template-shared';
import { AuthBootstrap } from '../auth-bootstrap';

vi.mock('@icore/template-shared', async () => {
  const actual =
    await vi.importActual<typeof import('@icore/template-shared')>('@icore/template-shared');
  return { ...actual, performSilentRefresh: vi.fn() };
});

describe('AuthBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('shows a loading state, then renders children once the refresh resolves', async () => {
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce({
      accessToken: 'at',
      user: { id: 'u1', email: 'u@x.com' },
    });

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument());
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'u@x.com' });
  });

  it('renders children even when the refresh fails (unauthenticated state, not an error)', async () => {
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce(null);

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument());
    expect(useAuthStore.getState().user).toBeNull();
  });
});
```

**No `.unit.test.tsx` files exist anywhere in this repo yet** (verified via `find . -iname "*.unit.test.tsx"`) — `client-shadcn` has `@testing-library/react`/`@testing-library/dom` as devDependencies and an inferred Vitest target (`apps/templates/client-shadcn/vite.config.mts`'s `test: commonTestConfig(...)` block), but no existing component-render test to mirror. This test is the first of its kind in the project. `AuthBootstrap` has no routing/query dependency, so a bare `render()`/`screen`/`waitFor` from `@testing-library/react` (as shown below) should work without a wrapper — confirm by running it rather than assuming a convention that doesn't exist yet.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test client-shadcn -t "AuthBootstrap"`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `AuthBootstrap`**

Create `apps/templates/client-shadcn/src/app/auth-bootstrap.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { performSilentRefresh, useAuthStore } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    void performSilentRefresh(import.meta.env.VITE_API_URL ?? '/api').then((result) => {
      if (cancelled) return;
      if (result) setUser(result.user);
      setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (!booted) {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </main>
    );
  }

  return <>{children}</>;
}
```

`performSilentRefresh` is already re-exported from `@icore/template-shared`'s public index via Task 8 Step 13.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test client-shadcn -t "AuthBootstrap"`
Expected: PASS — both tests.

- [ ] **Step 5: Wire into `main.tsx`**

In `apps/templates/client-shadcn/src/main.tsx`, find:

```tsx
createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider>
          <RouterProvider router={router} />
          <Toaster richColors />
        </AbilityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

Replace with:

```tsx
import { AuthBootstrap } from './app/auth-bootstrap';

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider>
          <AuthBootstrap>
            <RouterProvider router={router} />
            <Toaster richColors />
          </AuthBootstrap>
        </AbilityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

(Add the `import` line near the file's other local imports, not inline where shown above — shown adjacent here only for clarity about which import it is.)

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/templates/client-shadcn/src/app/auth-bootstrap.tsx apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx apps/templates/client-shadcn/src/main.tsx
yarn nx lint client-shadcn
yarn nx build client-shadcn
```

- [ ] **Step 7: Commit**

```bash
git add apps/templates/client-shadcn/src/app/auth-bootstrap.tsx apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx apps/templates/client-shadcn/src/main.tsx
git commit -m "feat(client): add AuthBootstrap silent-refresh-on-boot wrapper"
```

---
