### Task 8: client-antd

Same deliverable as Task 7 for `apps/templates/client-antd` (reuse its look: `Form`, `Input.Password`, `Typography`, `Space`, `Result`/`Alert` for the sent state — follow `MagicLinkForm.tsx` and `RegisterForm.tsx` in that template; forms call `api` from `@/main` directly and use `useNotify`/`useAuthStore`/`useNavigate` like its `LoginForm`).

**Files:** create `components/auth/ForgotPasswordForm.tsx`, `ResetPasswordForm.tsx`, `routes/reset-password.tsx`, tests `__tests__/ForgotPasswordForm.spec.tsx`/`ResetPasswordForm.spec.tsx`; modify `LoginForm.tsx` (flag + `onSwitchForgot` prop + link), `routes/login.tsx` (mode `forgot`), regenerate `routeTree.gen.ts`.

**Interfaces:** `ForgotPasswordForm({ onSwitchLogin })`, `ResetPasswordForm({ token })` (it signs in + navigates itself, like antd's `RegisterForm`); `LoginForm` gains `onSwitchForgot: () => void`.

- [ ] **Step 1: Failing tests.** Mock the API module the way the existing antd specs do not need (their `LoginForm.spec` only renders): for the two new forms mock `@/main` with `vi.mock('@/main', () => ({ api: vi.fn() }))`, import the mocked `api`, drive the antd `Form` with `fireEvent.change` on `getByLabelText(...)` + `fireEvent.click(getByRole('button', { name: ... }))` and `waitFor` the assertions: (a) forgot: `api` called with `('/auth/password/forgot', objectContaining({method:'POST'}))` and the sent copy `auth.forgotPasswordSent` appears; (b) reset: short password → `api` not called; valid + mismatched → not called; valid + matching → `api` called with `/auth/password/reset` and a body containing the token. Extend `LoginForm.spec.tsx` with the flag-on/flag-off cases for `auth.forgotPassword` (same stub/reset/import pattern). If a render-level antd assertion proves flaky locally because of the known cold-import timeout, keep the assertion and note in the ledger (CI is the arbiter).
- [ ] **Step 2: Run to fail** — `yarn nx test client-antd -- ForgotPasswordForm ResetPasswordForm` → FAIL (modules missing).
- [ ] **Step 3: Implement** mirroring Task 7 semantics with antd components: validation messages from `t('auth.passwordTooShort')` / `t('auth.passwordMismatch')` via `Form.Item` rules; 400 → `notify.error(t('auth.resetPasswordInvalidToken'))`; success → `setUser`, `notify.success`, `await navigate({ to: '/dashboard' })`; route file identical in structure (`createFileRoute('/reset-password')`, `beforeLoad` redirect when the flag is off, `resolveResetToken`).
- [ ] **Step 4: Regenerate route tree** (`yarn nx run client-antd:vite:build`), check `/reset-password` in `routeTree.gen.ts`, run `check-route-integrity.mjs`.
- [ ] **Step 5: Verify** — `yarn nx test client-antd` (ignore the two pre-existing `LoginForm.spec` cold-import timeouts locally if they recur; they fail identically before this change), lint, `vite:build`.
- [ ] **Step 6: Commit** — `git add apps/templates/client-antd && git commit -m "feat(client-antd): forgot-password link, forgot + reset forms, /reset-password route"` (after `npx prettier --write apps/templates/client-antd/src`).

---
