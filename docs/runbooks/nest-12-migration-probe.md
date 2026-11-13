# NestJS 12 probe (2026-11-13)

**Status: waiting.** Decision (2026-11-13): do not migrate yet. Re-run this probe when a stable Nx 24.1 ships; the Cloudflare Workers host (item 1 below) decides the schedule.

The probe ran on a throwaway local branch (`spike/nest-12-nx-24-1-beta`, never pushed): Nest 12 + `@nx/nest@24.1.0-beta.0` (all `@nx/*` and `nx` on the same beta) on top of `dev` (Nx 24.0.6). It was not meant to merge; this page is the record. Stable Nx 24.0.6 blocks Nest 12 (`@nx/nest` peers `@nestjs/core|common` `<12`).

## Versions tried

`@nestjs/{common,core,microservices,platform-express,testing,websockets}` 12.5.0, `swagger` 12.1.2, `config` 12.1.1, `mongoose` 12.0.1, `schematics` 12.0.13;
`throttler` 6.7.1 unchanged (already allows 12). `yarn install` resolves; `@nx/nest@24.1.0-beta.0` peers `<13`.

## Result of `yarn nx run-many -t lint test build`

| Step                                                                 | Result                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Drop-in version bump                                                 | `shared:build` fails: `TS1479` / `TS1541` - **every Nest 12 package is ESM-only** (`"type": "module"`), our NestJS projects are CommonJS |
| tsconfigs `module: node20` + `moduleResolution: nodenext` (39 files) | All builds + lint green: `shared`, `api`, 6 microservices, client templates; TS accepts `require()` of ESM                               |
| `apps/worker` esbuild                                                | Needs two more alias stubs in `wrangler.jsonc`: `@nats-io/transport-node` (Nest 12's new NATS driver) and `@fastify/static`; then builds |
| `ai-client:test`, `jobs-client:test` (jest)                          | **Fail: `ERR_REQUIRE_ESM`** - jest-runtime cannot load Nest 12. Needs those libs moved to vitest (the other libs already use it)         |
| `create-icore:test`                                                  | Green after the `mongoose` pin in `scaffold-env.ts` (`^12.0.1`); `sync-template-shell.mjs` had nothing left to sync                      |
| Runtime on Node 24                                                   | `require('@nestjs/core')` works; the built `auth` microservice boots (NestFactory, InstanceLoader, fake-strategy banner)                 |
| `yarn nx run worker:smoke` (`wrangler dev --local`)                  | **Fails in workerd** at module load: `Uncaught TypeError: The argument 'path' ... must be a file URL ... or an absolute path string`     |

## Still open before a real migration

1. Cloudflare Workers host: Nest 12 throws while loading inside workerd (likely an ESM `import.meta.url` / `fs` use at import time in a Nest 12 package). Find the culprit, or keep the Worker on a bundled/pinned path. `--host=cloudflare` is the blocker.
2. jest -> vitest for `libs/ai-client` and `libs/jobs-client` (`notes-client`/`payment-client` have no tests).
3. Generated projects: `create-icore` templates inherit the tsconfig change; an install-mode scaffold smoke (yarn/npm/pnpm) on Nest 12 was NOT run, and neither was a booted gateway or full e2e.
4. `@nx/nest` generators and `tools/workspace-plugin`'s microservice generator were not exercised.
5. AGENTS.md "NestJS tsconfig" section (`module: CommonJS`, `moduleResolution: node16`) would need rewriting; `emitDecoratorMetadata` interplay with ESM Nest was not checked beyond the auth boot.

## Verdict

Feasible but not a version bump: a tsconfig-wide module change, a test-runner move, Worker host work and a beta Nx. Wait for stable Nx 24.1 (and re-run this probe on it); the Worker host decides the schedule.

## How to repeat the probe

1. Branch from `dev`. Bump `nx` and every `@nx/*` in all tracked `package.json` files to the new release; set `@nestjs/{common,core,microservices,platform-express,testing,websockets}` to `^12`, plus `swagger`, `schematics`, `config`, `mongoose` to their 12.x (`npm view <pkg> version`). Check `npm view @nx/nest@<version> peerDependencies` first: if it still says `<12`, stop.
2. `yarn install`, then `yarn nx run-many -t lint test build --skip-nx-cache`. Expect `TS1479` in `libs/shared` until the tsconfigs use `module: node20` + `moduleResolution: nodenext` (`node20` is not a valid `moduleResolution`: TS6046).
3. `apps/worker/wrangler.jsonc`: add `alias` stubs for `@nats-io/transport-node` and `@fastify/static` (-> `./stubs/empty.js`); then `yarn nx run worker:smoke` is the real Workers gate.
4. Boot a built microservice to prove `require()` of ESM Nest at runtime, e.g. `AUTH_TRANSPORT=tcp AUTH_HOST=127.0.0.1 AUTH_PORT=4010 node dist/apps/microservices/auth/main.js` from `apps/microservices/auth`.
5. Update this page with the new result and the dependency-upgrades status table.
