---
'@idevconn/create-icore': patch
---

Fix pnpm and yarn install failures in generated projects.

- **pnpm:** `pnpm 9+` no longer reads `"workspaces"` from `package.json` (requires `pnpm-workspace.yaml`) and ignores the `"pnpm"` key (settings moved to `pnpm-workspace.yaml`). Scaffold now creates `pnpm-workspace.yaml` with the workspace `packages` list and `onlyBuiltDependencies`, and removes the dead `"pnpm"` key from the generated `package.json`.
- **yarn:** `packageManager` was pinned to `yarn@4.5.0` in the template. Scaffold now reads the actual `yarnPath` from `.yarnrc.yml` and writes the matching version (e.g. `yarn@4.15.0`), keeping them in sync automatically.
- **Smoke test:** yarn 4 auto-enables `--immutable` in CI environments, but a freshly scaffolded project has an empty `yarn.lock`. The Layer B smoke now passes `--no-immutable` for the first install so the lockfile can be populated.
