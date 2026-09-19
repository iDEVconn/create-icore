---
'@idevconn/create-icore': minor
---

Move the refresh token out of localStorage into an httpOnly cookie (XSS hardening); the access token now lives in memory only. Adds CSRF double-submit protection on `/auth/refresh`, fixes a cross-tab refresh-rotation race via the Web Locks API, and switches `POST /auth/logout` to read the refresh cookie instead of the request body. Also bumps the scaffolded `@idevconn/api-client` pin in `_template-shell` to match root.
