---
'@idevconn/create-icore': patch
---

Projects generated with `auth=none` no longer keep the `/reset-password` route, which imported the removed `components/auth` files, so the client's `vite build` succeeds.
