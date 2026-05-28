# @idevconn/create-icore

## 0.1.1

### Patch Changes

- d01ae72: Fix the `bin` field shape and the build output so the published tarball actually has a working CLI:
  - `bin` is now an explicit object `{ "create-icore": "./dist/cli.js" }`. The old singleton-string form let npm rewrite the key into the scoped package name and then reject the path as an invalid script, breaking the publish.
  - Build emits both ESM (`dist/*.js`) and CJS (`dist/*.cjs`) via `tsup --format esm,cjs`, exposed through a proper `exports` map mirroring `@idevconn/use-draft`.
  - `package.json` picks up `keywords`, `bugs`, `homepage`, and a `prepublishOnly` guard (`typecheck && test && build`).

## 0.2.0

### Minor Changes

- fe00191: Initial release: bootstrap CLI that scaffolds an icore monorepo with the chosen auth provider (Supabase / Firebase), db provider (mirrors auth in v0.1.0), upload provider (Supabase / Firebase / Cloudinary / none), microservice transport (TCP / Redis / NATS), and UI library (shadcn for v0.1.0; antd + MUI fall back to shadcn until 6.1 / 6.2 ship).
