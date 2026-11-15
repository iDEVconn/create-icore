---
'@idevconn/create-icore': patch
---

Generated clients no longer call the non-existent `POST /api/auth/refresh` on a 401: `createIcoreApi` passes no refresh token, so a 401 goes straight to logout and the login redirect instead of a 404 first.
