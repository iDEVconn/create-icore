---
'@idevconn/create-icore': minor
---

Add the `create-icore migrate [--to=<version>] [--continue]` CLI subcommand — consumes the `registry.json` shipped by the migration-registry pipeline (a separate, already-merged plan) to walk an already-scaffolded project through pending migrations. Mechanical fixes apply and commit automatically; fixes needing judgment print a description and the real diff, then pause for the user's own coding agent to apply and commit (marker convention: `migrate: <id>`). Progress is tracked entirely via git-log commit-message markers — no state file, so re-running the same command always resumes correctly. No real migration entries or codemods are authored yet; this ships only the mechanism.
