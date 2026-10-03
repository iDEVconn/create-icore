---
'@idevconn/create-icore': patch
---

Fixes the CodeQL suppression comment added in a prior patch — GitHub's `// codeql[rule-id]` directive must sit immediately adjacent to the specific flagged argument, not just before the statement it's part of. The `oauth_state` cookie write's suppression is repositioned inside the `res.cookie(...)` argument list, directly before `state`, matching the pattern that actually worked for the equivalent (now-deleted) `icore_rt` cookie suppression.
