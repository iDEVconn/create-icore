---
'@idevconn/create-icore': patch
---

Pre-approve `esbuild` and `workerd` build scripts in the generated `pnpm-workspace.yaml` so `--host=cloudflare` + pnpm installs no longer fail with `ERR_PNPM_IGNORED_BUILDS`.
