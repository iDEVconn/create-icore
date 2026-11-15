---
'@idevconn/create-icore': patch
---

Fix storage path traversal: `assertOwnership` and the list `prefix` (REST and GraphQL) now reject `..`, `.`, empty segments, backslashes and control characters, so `uid/../other/x` can no longer reach another user's files.
