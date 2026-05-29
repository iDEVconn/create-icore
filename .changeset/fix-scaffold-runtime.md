---
'@idevconn/create-icore': patch
---

Scaffolded projects are now runnable out of the box. v0.2.2 shipped the source tree but the scaffolded `package.json` was empty + the client template kept `../../../`-anchored paths that pointed one level above the project root.

Fixes:

- `_template-shell/package.json` now ships the full devDeps (`nx`, plugins, eslint, prettier, vitest, etc.) + runtime deps consumers need. `yarn install` actually installs nx so `yarn nx build api` works.
- Scaffolder writes an empty `yarn.lock` at the project root. Anchors yarn 4 to the new directory so it stops walking up into the user's `$HOME` (where a stray `package.json`/`yarn.lock` would otherwise confuse the workspace boundary).
- After copying the chosen client template to `apps/client`, the scaffolder rewrites the four files that hard-coded the old depth: `vite.config.mts`, `tsconfig*.json`, `project.json`, `eslint.config.mjs`. `../../../` → `../../`, `client-shadcn|antd|mui` → `client`.
- `removePaymentStack` / `removeJobsStack` / `removeUploadStack` now also strip their deps from `apps/api/package.json` so yarn doesn't try to resolve `@icore/jobs-client`, `@idevconn/payment`, `@icore/upload-client`, `@bull-board/*`, `@types/multer` after opting out.
- CLI prints its own version in the intro banner and warns when a newer version is on npm: `Re-run with @latest to refresh`.
