### Task 9: client-mui

Same as Task 8 for `apps/templates/client-mui` (MUI `TextField`, `Button`, `Stack`, `Typography`, `Alert`; follow its `MagicLinkForm.tsx`/`RegisterForm.tsx`; hooks inside the forms). `LoginForm` gains `onSwitchForgot: () => void`; `login.tsx` mode `forgot`.

- [ ] **Step 1: Failing tests** — same three spec files as Task 8 adapted to MUI (`getByLabelText('auth.newPassword')` works with `TextField label`), `vi.mock('@/main', …)`; `LoginForm.spec.tsx` flag cases.
- [ ] **Step 2: Run to fail** — `yarn nx test client-mui -- ForgotPasswordForm ResetPasswordForm` → FAIL.
- [ ] **Step 3: Implement** (mirrors Task 7/8; use `SyntheticEvent<HTMLFormElement>` for submit handlers; remember `client-mui/src/globals.css` is not to be touched — run prettier only on files you changed, never on `apps/templates` wholesale).
- [ ] **Step 4: Regenerate route tree** (`yarn nx run client-mui:vite:build`), `check-route-integrity.mjs`.
- [ ] **Step 5: Verify** — `yarn nx test client-mui` (same cold-import caveat), lint, `vite:build`.
- [ ] **Step 6: Commit** — `git add apps/templates/client-mui && git commit -m "feat(client-mui): forgot-password link, forgot + reset forms, /reset-password route"`.

---
