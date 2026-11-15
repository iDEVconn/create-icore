---
'@idevconn/create-icore': patch
---

`--auth=none` shadcn projects no longer ship `routes/__tests__/auth.callback.unit.test.tsx`, which imported a route that auth=none already excludes.
