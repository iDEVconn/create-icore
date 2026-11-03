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

| Package                                                | Status              | Reason                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nx 23 → 24                                             | Done                | Upgraded via `nx migrate 24.0.3` + `nx migrate --run-migrations` (removed deprecated executors, added the ready-signal plugin). lint/test/build and the install-mode smoke are green. |
| NestJS 11 → 12                                         | Blocked             | `@nx/nest@24.0.3` (still `latest`) peers `@nestjs/core\|common` `<12`; wait for a release that supports 12. `@nestjs/schematics@12` / `swagger@12` follow.                            |
| TypeScript 6 → 7                                       | Blocked             | `typescript-eslint@8.72` needs `<6.1`, `ts-jest@29` needs `<7`, `@nestjs/swagger@12` needs `<7`.                                                                                      |
| `@types/node` 22 → 24                                  | Done                | Types follow the Node 24 runtime (`.nvmrc`); `^26` is intentionally skipped.                                                                                                          |
| `tsup` 9, `vite-plugin-pwa` 2, `@anthropic-ai/sdk` 1.x | Done                | lint/test/build green; `client-shadcn` still emits `sw.js` + manifest; `create-icore` tarball and install-mode smoke (pnpm) pass.                                                     |
| `postgres` 3 → 4                                       | Blocked             | v4 is ESM-only (`TS1479`: the CommonJS Nest libs `auth-postgres` / `db-postgres` cannot `require` it). Needs a dynamic `import("postgres")` rewrite in both strategies first.         |
| `minimatch` 11                                         | Done (create-icore) | Bumped in `tools/create-icore`; see the security section for the `resolutions`.                                                                                                       |

## Test plan

Verify a bump in a throwaway copy of the repo (not your working tree), then
re-run `yarn nx run-many -t lint test build` on the branch. For anything touching
generated projects also run
`node tools/create-icore/scripts/smoke-scaffold.mjs --jobs=bullmq --pm=pnpm --mode=install --run`
(install mode is the only one that catches version drift).

## Dependabot security alerts

Alerts track `main`, almost all are transitive packages that live only in `yarn.lock`. Routine (2026-11-03 pass took 143 open alerts down to 9):

1. Export alerts: `gh api --paginate "repos/<org>/<repo>/dependabot/alerts?state=open&per_page=100"`.
2. For each package: `yarn why <pkg>`, then `yarn up -R <pkg>` (lockfile-only, stays inside the parent's range). This closed most of them.
3. If a parent pins an exact version (`@nestjs/platform-express` → `multer`, `@nestjs/swagger` → `js-yaml`), add a root `resolutions` entry. Current entries and the condition to remove them:
   - `multer: 2.5.0`: drop once `@nestjs/platform-express` depends on `multer >= 2.5.0`.
   - `js-yaml@5.3.0: 5.5.0`: drop once `@nestjs/swagger` depends on `js-yaml >= 5.4.1`.
   - `uuid@^9.0.1: ^11.1.1` (gaxios; 11.x still ships CJS): drop once gaxios moves off uuid 9.
   - `esbuild@^0.27.0: ^0.28.1` (tsup 8): drop with the tsup 9 upgrade.
   - `minimatch@^10.2.5|^10.2.6: ^11.0.4`: drop once the parents allow 11.
4. Verify: `yarn install --immutable`, `yarn nx run-many -t lint test build`, install-mode smoke (yarn and pnpm). Generated projects resolve fresh at install and do not use this repo's lock or `resolutions`.

Still open (not safely fixable by a lock change):

| Package                                             | Why                                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `decode-uri-component` 0.2.2 (via `query-string@7`) | Fix 0.5.x is ESM-only; `query-string@7` is CJS. Needs a parent change.                                      |
| `stream-json` 1.9.1 (via `minio@8`)                 | Fix is 3.x with a different file layout (`jsonl/Parser.js` is used by `minio`). Wait for a `minio` release. |
| `minimatch` 3/5/9, `glob` 10/11/13                  | Major jump (`glob` 14, `minimatch` 11) in dev tooling; parents need to move.                                |
| `deepmerge` 4.3.1                                   | No patched version exists; dismiss with that reason.                                                        |
