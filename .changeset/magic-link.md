---
'@idevconn/create-icore': minor
---

Passwordless email sign-in (magic link) across all auth providers + UI templates.

- `AuthStrategy` gains `sendMagicLink({ email, callbackUrl })` and `verifyMagicLink(token)`.
- Supabase implements via `signInWithOtp` + `verifyOtp({ type: 'magiclink' })`.
- Firebase implements via Identity Toolkit `sendOobCode` + `signInWithEmailLink`, with the strategy serialising the email + `oobCode` as a single opaque token (`base64(email):oobCode`) so the contract stays single-string.
- Auth MS handles `auth.magicLink.send` + `auth.magicLink.verify` patterns; the verify path reuses the existing `ADMINS_LIST` role hook so magic-link signups land in the same role assignment flow as password signups.
- Gateway exposes `POST /api/auth/magic-link` + `POST /api/auth/magic-link/verify`, both `@Public()` and rate-limited by the existing `auth-burst` throttle (`CLIENT_ORIGIN` env drives the callback URL).
- Every client template ships a Password / Magic-link mode switch on `/login` + a new `/auth/callback` route that exchanges the link's token for a session.
- Each template's `vite.config.mts` now splits `node_modules` into library-specific vendor chunks (`vendor-react`, `vendor-tanstack`, `vendor-mui`/`vendor-antd`/`vendor-ui`, etc.) for cacheability and faster repeat loads.
