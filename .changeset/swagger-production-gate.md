---
"@idevconn/create-icore": patch
---

Disable the Swagger UI/JSON (`/api/docs`) when `NODE_ENV=production`, since it previously had no production restriction and exposed the full API contract publicly.
