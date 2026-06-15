---
"@idevconn/create-icore": patch
---

fix: strip abilities re-export from libs/shared/src/client.ts when auth=none to prevent Vite import resolution error at dev-server startup
