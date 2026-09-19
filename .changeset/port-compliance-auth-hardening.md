---
'@idevconn/create-icore': minor
---

Cross-checked a downstream project that already shipped the httpOnly-cookie-auth feature and ported three hardening fixes it found:

- `verifyCsrf` now compares the CSRF cookie/header with `timingSafeEqual` instead of `===` (timing-attack surface).
- The gateway now sets Express `trust proxy` (1 hop, production-only) so per-IP rate limiting keys on the real client IP behind a reverse proxy/load balancer, not the proxy's own IP.
- Added `POST /auth/session/adopt` plus client-side hash-fragment detection in the magic-link and OAuth callback routes, for Supabase projects configured to use the implicit auth flow (a valid, per-project Supabase setting outside this scaffold's control) — without it, such a project's magic-link/OAuth login would silently discard a real, valid Supabase session sitting unused in the URL hash fragment.

Also fixes a token-substitution vulnerability found while implementing the last item: `session/adopt` now cross-validates that the supplied access and refresh tokens actually belong to the same user (via a real `authClient.refresh()` call) before adopting either.
