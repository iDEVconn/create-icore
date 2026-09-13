---
'@idevconn/create-icore': patch
---

`create-icore` no longer reports "Project scaffolded / Done" when the post-scaffold package-manager install fails (e.g. npm's `EALLOWSCRIPTS` in project-scoped installs). The CLI now checks the install exit status and, on failure, warns and prints manual fallback install steps instead of the success/"next steps" block.
