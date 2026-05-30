---
'@idevconn/create-icore': patch
---

fix: corepack PnP crash on yarn create + upgrade pinned yarn to 4.15.0

`yarn create @idevconn/icore` ran the CLI inside a PnP dlx context where
`spawnSync('yarn', ['install'])` triggered corepack, which could not resolve
itself in the PnP virtual FS. Fix: `runInstall()` now reads `yarnPath` from
the generated project's `.yarnrc.yml` and calls `node <path> install`
directly, bypassing corepack entirely.

Pinned yarn in generated projects upgraded from 4.5.0 to 4.15.0.
