# Account email flows — signup confirmation + forgot password (design)

Status: approved in chat 2026-10-02 (spec pending review). Ships as **two PRs**: PR 1 (bug) then PR 2 (feature).

## Problem

1. **Signup 500 on Supabase.** With "Confirm email" enabled GoTrue returns a user and **no session**. `SupabaseAuthStrategy.signUp` (`libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`) treats that as failure and throws a plain `Error('signup_failed')`; the RPC filter scrubs it to a 500. The client already has a `checkEmail` mode (`CheckEmailScreen`) but is never reached. Logging in before confirming also surfaces an unnamed error.
2. **Emails point at `localhost:3000`.** `signUp` passes no `emailRedirectTo`, so Supabase falls back to the project's Site URL (default `http://localhost:3000`). Magic-link already builds its callback from `CLIENT_ORIGIN` in the gateway; signup does not.
3. **No forgot-password** anywhere (UI, gateway, strategies, contract).

## Scope

- In: Supabase + Firebase (provider sends the email). All three clients (shadcn, antd, mui). Generator + docs.
- Out: postgres/mongodb (no mailer — flow hidden via the existing `OAUTH_MAGIC_LINK_PROVIDERS` mechanism in `tools/create-icore/src/lib/scaffold-env.ts`), `auth=none`, a `MailStrategy`, "resend confirmation email".

## Design

### Contract (`libs/shared/src/strategies/auth.ts`)

- `signUp(email, password, opts?: { callbackUrl?: string }): Promise<SignUpResult>` where
  `SignUpResult = { status: 'session'; session: AuthSession } | { status: 'confirmation_required'; user: { id: string; email: string } }`.
  `user` is needed so the auth MS can still `assignInitialRole(user.id, user.email)`. Firebase/Fake/Postgres/Mongo always return `status: 'session'` (Postgres/Mongo updated mechanically).
- `requestPasswordReset(email: string, callbackUrl: string): Promise<void>`.
- `confirmPasswordReset(token: string, newPassword: string): Promise<AuthSession>`.
- Error codes (RPC messages): `email_not_confirmed`, `invalid_reset_token`.
- `FakeAuthStrategy` (`libs/shared/src/strategies/fakes/fake-auth.ts`): reset-token map + `getLastPasswordResetToken(email)` (mirrors magic-link), optional "confirmation required" switch so the contract can exercise both signup shapes. `runAuthContract` gains cases for both; strategies lacking the capability are gated the way magic-link is.

### Auth MS (`apps/microservices/auth/src/app/auth.controller.ts`)

- `auth.signup`: on `confirmation_required` → `assignInitialRole`, **skip** the re-mint `refresh()`, return the union. On `session` → unchanged behaviour.
- New patterns `auth.password.forgot` and `auth.password.reset` (reset re-mints via `refresh()` like signup so the role is baked into the new token).

### Gateway (`apps/api/src/app/auth/auth.controller.ts`, `libs/auth-client`)

- `RPC_ERROR_MAP`: `email_not_confirmed` → `ForbiddenException`, `invalid_reset_token` → `BadRequestException`.
- `POST /auth/register`: session → today's response; `confirmation_required` → **202** `{ status: 'confirmation_required', email }`, no cookie. Passes `callbackUrl = ${CLIENT_ORIGIN}/auth/callback`.
- `POST /auth/password/forgot`: `@Public() @SkipCsrf()`, `auth-burst` throttle. **Always** 200 `{ ok: true }` (no account enumeration); provider errors are logged only. `callbackUrl = ${CLIENT_ORIGIN}/reset-password`.
- `POST /auth/password/reset` `{ token, password }`: `@Public() @SkipCsrf()`, same throttle. On success: `sessionStore.deleteAllForUser(uid)` + provider revoke (same logic as `revokeUser`, extracted to a private helper), then `startSession` for the new password.
- Boot-time warning when `CLIENT_ORIGIN` is unset (falls back to `http://localhost:4200`).

### Strategies

- **Supabase**: `signUp` passes `emailRedirectTo`; `!data.session && data.user` → `confirmation_required`; real errors still throw. `signIn` maps GoTrue's "Email not confirmed" (`code: 'email_not_confirmed'`) → `RpcException('email_not_confirmed')`. Reset: `resetPasswordForEmail(email, { redirectTo })`; confirm: `verifyOtp({ type: 'recovery', token_hash })` (yields a recovery session) → `admin.updateUserById(user.id, { password })` → `admin.signOut(recoveryAccessToken, 'global')` to end every other session → `signInWithPassword(email, newPassword)` for the fresh session.
- **Firebase** (`identity-toolkit.client.ts`): `sendOobCode({ requestType: 'PASSWORD_RESET', email, continueUrl })`; new `resetPassword({ oobCode, newPassword })` (`accounts:resetPassword`); then `admin.auth().revokeRefreshTokens(uid)` and `signIn` for the session. Token format `base64(email):oobCode`, same as magic-link. Mock identity-toolkit extended.

### Clients (shadcn, antd, mui — one component per file, per AGENTS.md)

- `login.tsx`: new `forgot` mode; "Forgot password?" link (hidden when the provider doesn't support it — same flag path as OAuth/magic-link).
- New `ForgotPasswordForm.tsx` (email → `CheckEmailScreen`) and `ResetPasswordForm.tsx`; new route `/reset-password` (reads `token` / `token_hash` / `oobCode`+`email` the way `auth.callback.tsx` does).
- `RegisterForm`/`login.tsx`: `confirmation_required` → `CheckEmailScreen`; `session` → straight into the app. Login `403 email_not_confirmed` → localized message.
- i18n en/ru/he for all new strings. Run `ui-ux-pro-max` before writing UI. React 19 event types per AGENTS.md. TanStack route files written in one pass (never empty).

### Generator + docs

- `docs/runbooks/auth-email-setup.md` (new): Supabase → Authentication → **URL Configuration**: Site URL = `CLIENT_ORIGIN`; Redirect URLs include `<origin>/auth/callback` and `<origin>/reset-password`; email templates for Magic Link / Confirm signup / Reset password use `{{ .TokenHash }}` links. Firebase → Authentication → Templates → Password reset → custom action URL `<origin>/reset-password`.
- `create-icore` prints this as "Next steps" for `auth=supabase|firebase` and writes it into the generated README (`scaffold-pkg.ts`). Hidden-feature wiring for postgres/mongodb/`auth=none` covered by generator tests.
- Update `AGENTS.md` + `docs/architecture.md`; changesets (`patch` for PR 1, `minor` for PR 2).

## PR split

- **PR 1 — `bug/signup-email-confirmation`**: `SignUpResult` + signup `callbackUrl`, `email_not_confirmed`, gateway 202 + client `confirmation_required` handling (3 clients), `CLIENT_ORIGIN` warning, runbook + Next-steps notice (Supabase part).
- **PR 2 — `feature/forgot-password`** (cut from `dev` after PR 1 merges): reset contract/strategies/MS/gateway/clients, runbook Firebase + recovery-template parts.

## Testing

- Contract: signup both shapes, `email_not_confirmed`, reset round-trip (Fake + Supabase mock + Firebase mock), invalid/reused token → `invalid_reset_token`.
- Gateway unit: register 201/202, forgot always-200 (existing and unknown email), reset revokes all sessions, throttle metadata, SkipCsrf present.
- Clients: component tests for forgot/reset/register-confirm in each of the 3 templates; route-integrity check stays green.
- Generator: forgot link/routes absent for postgres/mongodb/`auth=none`; Next-steps text present for supabase/firebase. Scaffold smoke stays green.

## Risks / open points

- Supabase recovery needs the `{{ .TokenHash }}` email-template change (same requirement as magic-link). Without it the link is a hosted-verify URL the `/reset-password` route cannot redeem, so the runbook + Next-steps notice are part of the feature, not optional docs.
- Existing Supabase deployments with confirmation disabled see no behaviour change.
- `SignUpResult` is a breaking contract change for third-party `AuthStrategy` implementers — changeset notes it.
