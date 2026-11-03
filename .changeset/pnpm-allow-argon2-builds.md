---
'@idevconn/create-icore': patch
---

Allow `argon2` build scripts in generated pnpm workspaces so `--auth=postgres` installs cleanly (pnpm 10+ failed with `ERR_PNPM_IGNORED_BUILDS`).
