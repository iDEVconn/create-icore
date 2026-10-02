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

## Troubleshooting

- **Email link opens `localhost:3000`** — Site URL not set (step 2).
- **Email link opens `localhost:4200` in production** — `CLIENT_ORIGIN` unset on the gateway (look for the warning in its log).
- **"requested path is invalid" from Supabase** — the callback URL is not in Redirect URLs.
