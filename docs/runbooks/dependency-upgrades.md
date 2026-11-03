# Dependency upgrades

How to bump dependencies in this repo without breaking generated projects, and
which major upgrades are currently blocked. Last audit: 2026-11-03.

## Problem

Dependencies live in many places: the root `package.json`, every
`apps/*`/`libs/*` manifest, `tools/create-icore/_template-shell/package.json`
(the root manifest of every scaffolded project), `scaffold-env.ts` pins and the
`create-icore` feature manifest. Bumping only some of them makes generated
projects drift from the repo, and link-mode smoke cannot see it (it reuses the
repo's `node_modules`).

## Minor and patch bumps (safe routine)

1. Branch `chore/deps-minor-patch` from `dev`.
2. `npx npm-check-updates --workspaces --root --target minor -u`, then `yarn install`.
3. `node tools/create-icore/scripts/sync-template-shell.mjs` (rewrites `_template-shell/package.json` from the root).
4. Update the pins in `tools/create-icore/src/lib/scaffold-env.ts` (`TRANSPORT_DEPS`, `MONGODB_DEPS`) and the deps in `tools/create-icore/src/manifest/index.ts` (e.g. `jobs`, `ai`).
5. Align workspace manifests the drift tests check (`libs/vite-plugins`, `libs/template-shared`: `vite`, `vitest`, `react`, `react-dom`).
6. `yarn nx migrate --run-migrations` if `nx` was bumped.
7. `npx prettier --write` on touched files, then `yarn nx run-many -t lint test build`.
8. Add a `.changeset/*.md` (`patch` for `@idevconn/create-icore`).

The `create-icore` tests `template-shell-drift` and `workspace-ownership` fail
until steps 3-5 are done; that is the intended guard, not a regression.

## Keep `@bull-board/*` on one exact version

`@bull-board/api`, `express` and `ui` must be the same exact version in
`apps/api/package.json` and in the `jobs` manifest. `express` pins `api` and
`ui` exactly, so a range or a mismatched pin installs two copies of
`@bull-board/api` and the gateway fails to build (`TS2322: ExpressAdapter` is
not assignable to `IServerAdapter`). Bump all three together.

## Major upgrades: status

| Package                                                                              | Status    | Reason                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nx 23 → 24                                                                           | Done      | Upgraded via `nx migrate 24.0.3` + `nx migrate --run-migrations` (removed deprecated executors, added the ready-signal plugin). lint/test/build and the install-mode smoke are green. |
| NestJS 11 → 12                                                                       | Blocked   | `@nx/nest@24.0.3` (still `latest`) peers `@nestjs/core\|common` `<12`; wait for a release that supports 12. `@nestjs/schematics@12` / `swagger@12` follow.                            |
| TypeScript 6 → 7                                                                     | Blocked   | `typescript-eslint@8.72` needs `<6.1`, `ts-jest@29` needs `<7`, `@nestjs/swagger@12` needs `<7`.                                                                                      |
| `@types/node` 22 → 26                                                                | Skip      | Runtime is Node 24 (`.nvmrc`); keep types on `^24`.                                                                                                                                   |
| `postgres` 4, `tsup` 9, `vite-plugin-pwa` 2, `@anthropic-ai/sdk` 1.x, `minimatch` 11 | Unchecked | Each is its own PR with its own test pass.                                                                                                                                            |

## Test plan

Verify a bump in a throwaway copy of the repo (not your working tree), then
re-run `yarn nx run-many -t lint test build` on the branch. For anything touching
generated projects also run
`node tools/create-icore/scripts/smoke-scaffold.mjs --jobs=bullmq --pm=pnpm --mode=install --run`
(install mode is the only one that catches version drift).
