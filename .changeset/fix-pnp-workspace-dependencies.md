---
'@idevconn/create-icore': patch
---

Restore generated-project `.yarnrc.yml` (node-modules linker), declare workspace-local build/runtime deps in every template manifest, and add ownership tests plus a migrate codemod for legacy projects. Validate CLI flag values (a typo like `--package-manager=yarn.` used to silently produce a PnP project), stop the `--` separator from swallowing the next flag, and prune the auth=none `@icore/shared` / `@icore/template-shared` barrels from the template instead of hardcoding them (fixes `api:build` TS2305 on the session-store exports).
