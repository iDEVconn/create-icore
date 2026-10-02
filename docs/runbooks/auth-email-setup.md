# Auth email setup (Supabase / Firebase)

Confirmation and magic-link emails are sent by the provider, not by iCore. Two things must line up or the links point at the wrong place.

## 1. `CLIENT_ORIGIN` (gateway)

`apps/api/.env`: `CLIENT_ORIGIN=https://your-client-url`. The gateway builds every email callback from it (`<origin>/auth/callback`) and the OAuth redirect (`<origin>/dashboard`). Unset → falls back to `http://localhost:4200` and logs a one-time warning.

## 2. Provider URL configuration

### Supabase

Project → **Authentication → URL Configuration**:

- **Site URL** = `CLIENT_ORIGIN`. Supabase's default is `http://localhost:3000`, so without this every confirmation email links to localhost:3000.
- **Redirect URLs** = `<CLIENT_ORIGIN>/auth/callback`.

The default email templates (`{{ .ConfirmationURL }}`) keep working: `/auth/callback` handles both the hash-session redirect and the `token_hash` shape.

### Firebase

**Authentication → Settings → Authorized domains** — add your client domain.

## Signup with "Confirm email" enabled (Supabase)

- `POST /api/auth/register` answers **202** `{ "status": "confirmation_required", "email": "…" }` and sets no cookies. The client shows the check-email screen. (Before this change the gateway answered 500.)
- The initial role (`ADMINS_LIST` → `admin`, else `user`) is assigned at signup, so the first login after confirming already has it.
- Logging in before confirming answers **403** `email_not_confirmed` (the clients show a localized message).
- With "Confirm email" disabled nothing changes: 201 `{ user }` + session cookies.
- For an already-registered address Supabase deliberately returns no error (anti account-enumeration); the response is the same 202.

## Forgot password (Supabase and Firebase)

Flow: login page → "Forgot password?" → `POST /api/auth/password/forgot` `{email}` → the provider emails a link → `<CLIENT_ORIGIN>/reset-password?token_hash=…` (Supabase) or `?oobCode=…` (Firebase) → the in-app form → `POST /api/auth/password/reset` `{token, password}` → signed in.

### Supabase

- **Redirect URLs** must include `<CLIENT_ORIGIN>/reset-password` (Authentication → URL Configuration).
- **Email Templates → Reset Password**: make the link `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` (the same `token_hash` shape the magic-link template needs). The default `{{ .ConfirmationURL }}` link cannot be redeemed by `/reset-password`.

### Firebase

- **Authentication → Templates → Password reset → Customize action URL** → `<CLIENT_ORIGIN>/reset-password`. Without it Firebase resets the password on its own hosted page and iCore's `/reset-password` is never reached (nothing breaks, you just lose the in-app page and the session sweep below).

### Behaviour

- `forgot` always answers `200 {ok:true}` — known and unknown addresses look identical (no account enumeration); provider errors are only logged. It has its own tighter throttle (`auth-burst`, 5/min).
- `reset` answers `400 password_too_short` (minimum 8) before touching the provider, and `400 invalid_reset_token` for a bad / expired / already-used link.
- A successful reset **ends every other session** of that user: at the provider (Supabase: `signOut('global')`; Firebase: `revokeRefreshTokens(uid)`) and in the gateway's Redis session store, then starts a fresh session. The provider step happens _after_ the password changes (so the old password can't mint a session in between) and is retried 3×; if it never succeeds the call fails with `session_revocation_failed` rather than reporting a reset that left old sessions alive.
- Postgres / MongoDB auth have no mailer: `requestPasswordReset`/`confirmPasswordReset` throw `not_implemented`, the generated client sets `VITE_AUTH_HAS_PASSWORD_RESET=false` (no link), and `/reset-password` redirects to `/login`.

## Troubleshooting

- **Email link opens `localhost:3000`** — Site URL not set (step 2).
- **Email link opens `localhost:4200` in production** — `CLIENT_ORIGIN` unset on the gateway (look for the warning in its log).
- **"requested path is invalid" from Supabase** — the callback URL is not in Redirect URLs.
- **Reset link opens a page that says the link is invalid** — the template link is missing `token_hash` (Supabase) or the Firebase action URL is not set; the page reads `token`, `token_hash` or `oobCode` from the query string.
