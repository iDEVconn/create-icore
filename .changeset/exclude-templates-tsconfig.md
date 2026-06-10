---
'@idevconn/create-icore': patch
---

Exclude the gitignored `tools/create-icore/templates` snapshot from `tsconfig.base.json`. The snapshot duplicates the root `libs/`/`apps/` sources, so the IDE/tsserver saw every symbol twice (e.g. `IdentityToolkitSignUpResponse`) and flagged false "duplicate" errors. Templates are a build artifact (like `dist`), not compiled here.
