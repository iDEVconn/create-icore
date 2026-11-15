---
'@idevconn/create-icore': patch
---

`snapshot-templates` now copies only files git knows (tracked, or untracked and not ignored), so a local `apps/api/.env`, agent state (`.claude-flow`, `ruvector.db`) and similar can no longer end up in `templates/` and the published tarball. The stale tracked copies under `templates/` are untracked.
