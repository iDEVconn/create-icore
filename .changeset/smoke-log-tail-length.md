---
"@idevconn/create-icore": patch
---

Bump smoke-scaffold.mjs's serve-log crash tail from 40 to 200 lines so the actual crash line survives when a busy service (e.g. the api gateway) floods the tail before the failure is detected.
