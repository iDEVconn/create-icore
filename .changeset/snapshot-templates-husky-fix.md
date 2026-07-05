---
"@idevconn/create-icore": patch
---

Fix snapshot-templates.mjs silently reverting the PM-agnostic (npx) husky pre-commit hook back to the repo's own yarn-based one on every build.
