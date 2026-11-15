---
'@idevconn/create-icore': patch
---

ci: run the create-icore tests on every PR. Its golden/matrix tests scaffold from the repo's `apps/` and `libs/`, which the Nx graph does not link to `create-icore`, so `nx affected` skipped them and `dev` went red after #417 and #422 behind a green PR.
