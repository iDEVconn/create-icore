---
'@idevconn/create-icore': minor
---

Move the refresh token out of localStorage into an httpOnly cookie (XSS hardening); the access token now lives in memory only. Adds CSRF double-submit protection on `/auth/refresh`, fixes a cross-tab refresh-rotation race via the Web Locks API, and switches `POST /auth/logout` to read the refresh cookie instead of the request body. Also bumps the scaffolded `@idevconn/api-client` pin in `_template-shell` to match root.

Final-review fix wave: fixes a critical dead mid-session refresh path (the gateway's `/auth/refresh` response was missing the sentinel `refreshToken` field the real `@idevconn/api-client` library hard-requires, silently logging every user out on access-token expiry); restores `client-mui`/`client-antd` to compiling and logging in after the shared auth store trim (no `AuthBootstrap` wiring for these two yet — that remains a follow-up); hardens `logout()` so a revoke failure no longer leaves the refresh cookie alive, now logged via `Logger.warn` for ops visibility; clears a stale persisted user on a failed silent refresh and skips that refresh call entirely on anonymous page loads; and documents `CLIENT_ORIGIN`.

Adding `typecheck` to CI's `check` job matrix is a valuable follow-up recommended by the review, but is deliberately NOT included in this PR — `client-mui` currently has 18 pre-existing, unrelated MUI prop-type errors that would immediately turn that check red for every PR in the repo. Do this once those are fixed separately.
