---
"@idevconn/create-icore": patch
---

Gate the Bull Board admin UI (`/api/admin/queues`) behind a bearer-token + admin-role check, since it was previously mounted as raw Express middleware and never passed through the global AuthGuard.
