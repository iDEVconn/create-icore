---
'@idevconn/create-icore': patch
---

Fix the `bin` field shape and the build output so the published tarball actually has a working CLI:

- `bin` is now an explicit object `{ "create-icore": "./dist/cli.js" }`. The old singleton-string form let npm rewrite the key into the scoped package name and then reject the path as an invalid script, breaking the publish.
- Build emits both ESM (`dist/*.js`) and CJS (`dist/*.cjs`) via `tsup --format esm,cjs`, exposed through a proper `exports` map mirroring `@idevconn/use-draft`.
- `package.json` picks up `keywords`, `bugs`, `homepage`, and a `prepublishOnly` guard (`typecheck && test && build`).
