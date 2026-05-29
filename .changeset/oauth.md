---
'@idevconn/create-icore': minor
---

Server-mediated OAuth sign-in (Google + GitHub) across all auth providers + templates. `AuthStrategy` gains `startOAuth(provider, callbackUrl)` + `completeOAuth(provider, code, state)`. Supabase routes through `signInWithOAuth` + `exchangeCodeForSession`; Firebase builds the provider authorize URL itself and exchanges the code via Identity Toolkit `signInWithIdp` (new `HttpOAuthTokenClient` handles the provider's `/token` endpoint). Gateway exposes `GET /api/auth/oauth/:provider` (302 → provider, sets `HttpOnly` state cookie) and `GET /api/auth/oauth/:provider/callback` (verifies CSRF state cookie, then redirects to `${CLIENT_ORIGIN}/auth/oauth/callback#…tokens…`). Every client template ships "Continue with Google/GitHub" buttons on `/login` + an `/auth/oauth/callback` route that pulls the session from the URL fragment.
