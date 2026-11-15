# Task 7 Part A report (api axis plumbing)

Commit: a14549c feat(create-icore): add the api axis plumbing (options, config, prompts, manifest units, blueprint, migrate). Not pushed.

## Built
- lib/options.ts: `ApiStyle`, required `CreateIcoreOptions.api`; validateOptions errors: `--api=<x> needs auth (resolvers are guarded by the session)` and `--host=cloudflare does not support --api=<x> ... docs/runbooks/cloudflare-workers-host.md`.
- lib/config.ts: `API_STYLES`, key `api` (`soap` rejected, message lists `rest, graphql, both`).
- lib/prompts.ts: `--api` flag, wizard "API style" after the example question (rest first, initialValue rest, empty answer -> rest), not asked and `rest` when auth=none or host=cloudflare; passed through in the returned options.
- manifest/types.ts + index.ts: `Manifest.api: Record<ApiStyle, Unit>` (rest EMPTY, graphql/both = shared GRAPHQL_SERVER unit) and `Manifest.apiClient`.
- manifest/resolve.ts `resolveUnits` only: pushes `MANIFEST.api[opts.api]`, and `MANIFEST.apiClient` when `api==='graphql' && ui!=='none'`. No exclusion lists touched.
- manifest/blueprint.ts: `api` recorded in root blueprint.json (`BlueprintJson.api?` optional for older projects). Still deterministic.
- migrate/migrate-cli.ts: `projectAxes.api = blueprint.api ?? 'rest'` (older blueprints are rest). `computePlan` was already generic, so `api:<style>` matching works as `ui:<unit>` does.
- scripts/smoke-scaffold.mjs: `--api` (default rest) into opts and the combo label.
- cli.ts: nothing needed (no `api` reference, next-steps output untouched).

## Dependency ranges (equal to root package.json)
- Server (graphql and both): `@apollo/server ^5.5.2`, `@as-integrations/express5 ^1.1.2`, `@nestjs/apollo ^14.2.1`, `@nestjs/graphql ^14.2.1`, `graphql ^16.11.0`.
- Client (apiClient): `@graphql-codegen/cli ^8.0.0`, `@graphql-codegen/typescript-operations ^7.0.1`, `@graphql-typed-document-node/core ^3.2.0`, `graphql ^16.11.0`, `vite-plugin-graphql-loader ^6.0.0`. No `@graphql-codegen/typescript`.
- Drift guard extended: new test in template-shell-drift.unit.test.ts checks MANIFEST.api/apiClient deps exist in root and match versions.

## TDD evidence
- RED: after fixtures + new tests, before implementation: `npx vitest run src/lib src/manifest src/migrate` -> 6 files failed, 20 tests failed (e.g. `expected [] to include '--api=graphql needs auth ...'`, `expected undefined to be 'rest'`).
- GREEN: full suite `npx vitest run` -> 47 files, 502 tests passed. `yarn nx run-many -t lint build -p create-icore` -> 4 tasks succeeded.
- New tests: validate-options (accept rest/graphql/both, both errors, rest+auth=none ok), config (accept 3, reject soap), prompts (flag parse, invalid, passthrough, wizard order/options/default, auth=none, cloudflare), resolve (rest/both/graphql/graphql+ui=none, rest EMPTY), blueprint (records api), plan (api axis match), migrate-cli (api=graphql applies, api=rest skips, missing api == rest), drift guard.
- All ~38 fixtures building CreateIcoreOptions got `api: 'rest'` (test files only; no non-test source built options objects).

## tsc baseline
`npx tsc -p tools/create-icore/tsconfig.lib.json --noEmit`: 10 pre-existing errors before (cli.ts nodeMajor, manifest/index.ts x2 Record<..., 'none'>, wire-client exact, wire-provider x5, migrate/plan.ts), identical set after (diffed with line numbers stripped). No new errors.

## Self-review / concerns
- Prettier run over src; `git checkout -- tools/create-icore/templates` done before commit (build re-dirtied templates/apps/api/project.json).
- Wizard coerces an undefined select answer to `rest` (the existing mocked-select tests return undefined).
- `api` flag validation of an explicit `--api=graphql` with auth=none/cloudflare happens in validateOptions (error), not auto-corrected; the wizard itself never asks in those cases.
- Link-mode smoke not run (belongs to Part B; the scaffold does not strip/wire GraphQL yet, so `--api=graphql` currently only changes deps and blueprint).
- No concerns blocking Part B.

## Fix round 1
Finding: `api: 'rest'` in the `allNone` fixture (validate-options.unit.test.ts line 185) widened to string.
- `npx tsc --noEmit -p tools/create-icore/tsconfig.spec.json` BEFORE: 18 errors, including 3 new TS2345 at validate-options.unit.test.ts (189, 195, 198).
- Fix: `api: 'rest' as const`.
- AFTER: 15 errors; the diff is exactly the 3 removed lines, nothing added. The remaining 15 are pre-existing (template-shell-drift 39-41, manifest/index, wire-client, wire-provider, migrate plan/e2e, build-registry). No other touched test file shows spec errors.
- Covering test: `cd tools/create-icore && npx vitest run src/lib/__tests__/validate-options.unit.test.ts` -> 1 file, 32 tests passed. Prettier unchanged.

## Fix round 2 (R10)
Owner ruling: `--api=graphql|both` with `--auth=none` is allowed.
- options.ts: removed the "needs auth" error; the cloudflare rule stays. The all-none notice now also requires `api === 'rest'`.
- prompts.ts: the "API style" question is asked for auth=none too; skipped (rest) only on host=cloudflare.
- Tests (RED first: 4 failed, `npx vitest run src/lib/__tests__/validate-options.unit.test.ts src/lib/__tests__/prompts.unit.test.ts`): validate-options (graphql/both + auth=none: no error, no warning; graphql + cloudflare + auth=none: exactly one error, the cloudflare one; all-none notice not printed for graphql/both) and prompts (`--api=graphql --auth=none` returns graphql without throwing; wizard asks API style with auth=none; cloudflare still rest).
- GREEN: full `npx vitest run` -> 47 files, 505 tests passed. `yarn nx run-many -t lint build -p create-icore` -> 4 tasks succeeded. Prettier applied.
- spec tsc error count (`npx tsc --noEmit -p tsconfig.spec.json`): 15 before, 15 after.
