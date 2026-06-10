---
'@idevconn/create-icore': minor
---

Each generated microservice/app (auth, upload, notes, payment, jobs, api, client) now also gets its own `blueprint.json` recording the selection relevant to it (component-level provenance), alongside the root project blueprint.json. Optional services that are off get no file.
