### Task 5: Clients — shared response helper, three RegisterForms/login routes, 403 message, i18n

**Files:**

- Create: `libs/template-shared/src/lib/auth/register-response.ts`
- Create: `libs/template-shared/src/lib/auth/__tests__/register-response.unit.test.ts`
- Modify: `libs/template-shared/src/index.ts` (export line)
- Modify: `libs/template-shared/src/lib/i18n/keys.ts` (`auth.emailNotConfirmed` en/ru/he)
- Modify: `apps/templates/client-shadcn/src/components/auth/RegisterForm.tsx`, `.../LoginForm.tsx`, `.../routes/login.tsx`
- Modify: `apps/templates/client-antd/src/components/auth/RegisterForm.tsx`, `.../LoginForm.tsx`
- Modify: `apps/templates/client-mui/src/components/auth/RegisterForm.tsx`, `.../LoginForm.tsx`
- Create: `apps/templates/client-shadcn/src/components/auth/__tests__/RegisterForm.spec.tsx`

**Interfaces:**

- Produces: `type RegisterResponse = { status: 'confirmation_required'; email: string } | { user: { id: string; email: string; role?: string } }`; `isConfirmationRequired(res: RegisterResponse): res is { status: 'confirmation_required'; email: string }` from `@icore/template-shared`.
- Behaviour: `confirmation_required` → existing `onSuccess(email)` (check-email screen); session → sign-in handling identical to a login success (store user, success toast, navigate `/dashboard`); login 403 → `t('auth.emailNotConfirmed')`.

- [ ] **Step 1: Write the failing helper test** — `libs/template-shared/src/lib/auth/__tests__/register-response.unit.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { isConfirmationRequired, type RegisterResponse } from '../register-response';

describe('isConfirmationRequired', () => {
  it('is true for the 202 confirmation payload', () => {
    const res: RegisterResponse = { status: 'confirmation_required', email: 'a@x.com' };
    expect(isConfirmationRequired(res)).toBe(true);
  });

  it('is false for a started session ({ user })', () => {
    const res: RegisterResponse = { user: { id: 'u1', email: 'a@x.com' } };
    expect(isConfirmationRequired(res)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test template-shared --testFile=register-response` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `libs/template-shared/src/lib/auth/register-response.ts`:

```ts
/** Body of `POST /auth/register`: 202 when the provider wants the email confirmed first, 201 `{ user }` otherwise. */
export type RegisterResponse =
  | { status: 'confirmation_required'; email: string }
  | { user: { id: string; email: string; role?: string } };

export function isConfirmationRequired(
  res: RegisterResponse,
): res is { status: 'confirmation_required'; email: string } {
  return 'status' in res && res.status === 'confirmation_required';
}
```

Add `export * from './lib/auth/register-response.js';` to `libs/template-shared/src/index.ts`. In `keys.ts` add, next to each language's `checkEmail`-area keys under `auth`: en `emailNotConfirmed: 'Please confirm your email first — check your inbox for the link.'`, ru `emailNotConfirmed: 'Сначала подтвердите email — ссылка в письме.'`, he `emailNotConfirmed: 'יש לאשר את האימייל תחילה — הקישור נמצא בתיבת הדואר.'`.

Run: `yarn nx test template-shared` — Expected: PASS.

- [ ] **Step 4: shadcn — failing component test** `apps/templates/client-shadcn/src/components/auth/__tests__/RegisterForm.spec.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisterForm } from '../RegisterForm';

function setup(apiResult: unknown) {
  const onSuccess = vi.fn();
  const onSignedIn = vi.fn();
  render(
    <RegisterForm
      api={(async () => apiResult) as never}
      onSuccess={onSuccess}
      onSignedIn={onSignedIn}
      onError={vi.fn()}
      onSwitchToLogin={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'a@x.com' } });
  fireEvent.change(screen.getByLabelText('auth.password'), { target: { value: 'pw12345!' } });
  fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
    target: { value: 'pw12345!' },
  });
  fireEvent.submit(screen.getByLabelText('auth.email').closest('form') as HTMLFormElement);
  return { onSuccess, onSignedIn };
}

describe('RegisterForm — register response handling', () => {
  it('shows the check-email flow on 202 confirmation_required', async () => {
    const { onSuccess, onSignedIn } = setup({ status: 'confirmation_required', email: 'a@x.com' });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('a@x.com'));
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('signs the user in when a session was started', async () => {
    const session = { user: { id: 'u1', email: 'a@x.com', role: 'user' } };
    const { onSuccess, onSignedIn } = setup(session);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(session));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
```

Run: `yarn nx test client-shadcn --testFile=RegisterForm` — Expected: FAIL (`onSignedIn` prop does not exist; always calls `onSuccess`).

- [ ] **Step 5: shadcn implementation.** `RegisterForm.tsx`: extend props and handler.

```tsx
import { isConfirmationRequired, type RegisterResponse } from '@icore/template-shared';

interface RegisterFormProps {
  onSuccess: (email: string) => void;
  onSignedIn: (session: { user: { id: string; email: string; role?: string } }) => void;
  onError: (msg: string) => void;
  onSwitchToLogin: () => void;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
}
export function RegisterForm({ onSuccess, onSignedIn, onError, onSwitchToLogin, api }: RegisterFormProps) {
```

and in `handleSubmit` replace the `await api(...)` + `onSuccess(email)` pair with:

```tsx
const res = await api<RegisterResponse>('/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (isConfirmationRequired(res)) onSuccess(res.email);
else onSignedIn(res);
```

`routes/login.tsx`: pass `onSignedIn={handleLoginSuccess}` to `<RegisterForm …>`. `LoginForm.tsx` (shadcn): import `ApiError` from `@icore/template-shared` (verify it is re-exported: `libs/template-shared/src/lib/api/create-api.ts:49`) and change the catch to:

```tsx
    } catch (err) {
      onError(
        err instanceof ApiError && err.status === 403
          ? t('auth.emailNotConfirmed')
          : err instanceof Error
            ? err.message
            : t('error.unknown'),
      );
```

- [ ] **Step 6: antd + mui.** Their forms use hooks directly (see their `LoginForm.tsx`: `useNavigate`, `useNotify`, `useAuthStore`). In each `RegisterForm.tsx` add the same hooks and replace the `await api('/auth/register'…)` + `onSuccess(…)` pair:

```tsx
const navigate = useNavigate();
const notify = useNotify();
const setUser = useAuthStore((s) => s.setUser);
// …inside the submit handler:
const res = await api<RegisterResponse>('/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (isConfirmationRequired(res)) {
  onSuccess(res.email);
} else {
  setUser(res.user);
  notify.success(t('auth.login'));
  await navigate({ to: '/dashboard' });
}
```

(antd uses `values.email`/`values.password` from its Form `onFinish` — keep those variable names; imports: `import { isConfirmationRequired, useAuthStore, useNotify, type RegisterResponse } from '@icore/template-shared';` and `import { useNavigate } from '@tanstack/react-router';`.) In each `LoginForm.tsx` catch, replace `notify.error(err instanceof Error ? err.message : t('error.unknown'))` with:

```tsx
notify.error(
  err instanceof ApiError && err.status === 403
    ? t('auth.emailNotConfirmed')
    : err instanceof Error
      ? err.message
      : t('error.unknown'),
);
```

adding `ApiError` to the `@icore/template-shared` import.

- [ ] **Step 7: Verify**

Run: `yarn nx test client-shadcn && yarn nx test client-antd && yarn nx test client-mui && yarn nx lint client-shadcn client-antd client-mui && yarn nx run-many -t build -p client-shadcn client-antd client-mui` (client builds use target `vite:build`: `yarn nx run client-shadcn:vite:build` etc. if `build` is missing) — Expected: all PASS/green. Then `node tools/create-icore/scripts/check-route-integrity.mjs`.

- [ ] **Step 8: Commit**

```bash
npx prettier --write $(git diff --name-only -- apps/templates libs/template-shared) libs/template-shared/src/lib/auth/register-response.ts libs/template-shared/src/lib/auth/__tests__/register-response.unit.test.ts apps/templates/client-shadcn/src/components/auth/__tests__/RegisterForm.spec.tsx
git add apps/templates libs/template-shared
git commit -m "fix(clients): register confirmation_required shows check-email; session signs in; 403 unconfirmed message

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
