---
'@idevconn/create-icore': patch
---

Add a CI route-integrity check (`tools/create-icore/scripts/check-route-integrity.mjs`) guarding against `@tanstack/router-generator` silently overwriting an emptied route file with its default `Hello` scaffold — catches empty routes, `Hello` scaffolds, and layout routes missing `<Outlet />` in `apps/templates/client-*` before they ship. Documented the risk and the route-file protection rule in `AGENTS.md`.
