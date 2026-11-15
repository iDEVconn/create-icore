---
'@idevconn/create-icore': patch
---

fix: storage handlers answer 400 (not a 500 TypeError) for a repeated or non-string `path`/`bucket`/`prefix` parameter, and `tools/remove-notes.mjs` no longer uses a backtracking regex to strip the notes i18n keys (the two CodeQL alerts raised on the dev to main PR).
