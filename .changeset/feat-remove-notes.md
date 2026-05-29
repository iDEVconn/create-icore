---
'@idevconn/create-icore': minor
---

feat: --example=notes|none flag and yarn remove-notes post-generate script

Pass `--example=none` at generate time to skip the notes CRUD sample entirely.
For existing projects, run `yarn remove-notes` to strip the notes MS, gateway
module, client routes/queries/components, nav item, and i18n keys in one pass.
The post-generate script uses `nx g @nx/workspace:remove` for Nx project
removal (handles tsconfig paths) and custom logic for the remaining UI files.
