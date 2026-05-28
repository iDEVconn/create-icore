---
'@idevconn/create-icore': patch
---

Fix the `bin` field shape in `package.json`. The previous string form (`"bin": "./dist/cli.js"`) made npm auto-rename the binary entry using the scoped package name and then reject the resulting `dist/cli.js` path as invalid during publish. Use the explicit object form (`{ "create-icore": "./dist/cli.js" }`) so the binary lands at `create-icore` cleanly.
