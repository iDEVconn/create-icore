# NestJS 12 probe (2026-11-13)

**Status (2026-11-14): nothing blocks the upgrade any more.** Two corrections after the first write-up: the `@nx/nest` peer range is advisory (see "Correction"), and the Cloudflare Workers failure has a root cause and a one-line fix (see "Workers: root cause"). The migration can run on stable Nx 24.0.6.

The probe ran on a throwaway local branch (`spike/nest-12-nx-24-1-beta`, never pushed): Nest 12 + `@nx/nest@24.1.0-beta.0` (all `@nx/*` and `nx` on the same beta) on top of `dev` (Nx 24.0.6). It was not meant to merge; this page is the record. Stable Nx 24.0.6 blocks Nest 12 (`@nx/nest` peers `@nestjs/core|common` `<12`).

## Versions tried

`@nestjs/{common,core,microservices,platform-express,testing,websockets}` 12.5.0, `swagger` 12.1.2, `config` 12.1.1, `mongoose` 12.0.1, `schematics` 12.0.13;
`throttler` 6.7.1 unchanged (already allows 12). `yarn install` resolves; `@nx/nest@24.1.0-beta.0` peers `<13`.

## Result of `yarn nx run-many -t lint test build`

| Step                                                                 | Result                                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Drop-in version bump                                                 | `shared:build` fails: `TS1479` / `TS1541` - **every Nest 12 package is ESM-only** (`"type": "module"`), our NestJS projects are CommonJS  |
| tsconfigs `module: node20` + `moduleResolution: nodenext` (39 files) | All builds + lint green: `shared`, `api`, 6 microservices, client templates; TS accepts `require()` of ESM                                |
| `apps/worker` esbuild                                                | Needs two more alias stubs in `wrangler.jsonc`: `@nats-io/transport-node` (Nest 12's new NATS driver) and `@fastify/static`; then builds  |
| `ai-client:test`, `jobs-client:test` (jest)                          | **Fail: `ERR_REQUIRE_ESM`** - jest-runtime cannot load Nest 12. Needs those libs moved to vitest (the other libs already use it)          |
| `create-icore:test`                                                  | Green after the `mongoose` pin in `scaffold-env.ts` (`^12.0.1`); `sync-template-shell.mjs` had nothing left to sync                       |
| Runtime on Node 24                                                   | `require('@nestjs/core')` works; the built `auth` microservice boots (NestFactory, InstanceLoader, fake-strategy banner)                  |
| `yarn nx run worker:smoke` (`wrangler dev --local`)                  | Fails in workerd at module load: `Uncaught TypeError: The argument 'path' ... Received 'undefined'`; **fixed**, see "Workers: root cause" |

## Still open before a real migration

1. ~~Cloudflare Workers host~~ - root cause found and fixed in the probe, see below.
2. jest -> vitest for `libs/ai-client` and `libs/jobs-client` (`notes-client`/`payment-client` have no tests).
3. Generated projects: `create-icore` templates inherit the tsconfig change; an install-mode scaffold smoke (yarn/npm/pnpm) on Nest 12 was NOT run, and neither was a booted gateway or full e2e.
4. `@nx/nest` generators and `tools/workspace-plugin`'s microservice generator were not exercised.
5. AGENTS.md "NestJS tsconfig" section (`module: CommonJS`, `moduleResolution: node16`) would need rewriting; `emitDecoratorMetadata` interplay with ESM Nest was not checked beyond the auth boot.

## Correction (2026-11-14): what the sibling project showed

The sibling project `crawler-nx` already runs Nest 12.5.0 on **stable Nx 24.0.6** (commit `aa906a8ac`, "upgrade NestJS 11 to 12"). Comparing with it:

1. **The `@nx/nest` peer range is advisory, not a blocker.** `@nx/nest@24.0.6` peers `@nestjs/core|common` `<12`, but `crawler-nx` just sets `legacy-peer-deps=true`. Here yarn only prints `YN0060`. We use `@nx/nest` for generators only (builds are `@nx/webpack`). A clean way to silence it in yarn is a `packageExtensions` entry for `@nx/nest@*` widening `@nestjs/core|common` to `<13` and `@nestjs/schematics` to `>=11 <13` in `.yarnrc.yml` (not tried here yet). No Nx beta needed.
2. **`reflect-metadata` is no longer imported by Nest 12.** They added `import 'reflect-metadata'` to every `main.ts` and `setupFiles: ['reflect-metadata']` to every vitest config. None of our `apps/api`, `apps/microservices/*/src/main.ts` or `apps/worker` entry files import it. The probe did not notice because the `auth` microservice got it transitively: do not rely on that, add it explicitly.
3. **tsconfig:** `module` and `moduleResolution` both `nodenext` (what they use) is enough; `module: node20` from the probe is equivalent, and `node20` is not a valid `moduleResolution`.
4. **Test runner:** they have no jest. Our jest-based `libs/ai-client` and `libs/jobs-client` must move to vitest (as found by the probe).
5. **They have no Cloudflare Worker.** The workerd load failure (item 1 below) is ours alone, which is why it is the only real blocker. They also use `@nestjs/platform-fastify` (we use express; the probe built fine with express 12.5.0).

## Workers: root cause

`worker:smoke` died at load with `Uncaught TypeError: The argument 'path' must be a file URL object, a file URL string, or an absolute path string. Received 'undefined'` (stack: `createRequire` in `node:module`).

- **Cause:** `@nestjs/swagger` 12 calls `createRequire(import.meta.url)` at module scope (`dist/swagger-ui/swagger-ui.js:4`, `dist/plugin/utils/plugin-utils.js:7`). workerd gives bundled modules no `import.meta.url`, so it is `undefined`. The gateway modules the Worker hosts import `@nestjs/swagger` (decorators), which pulls those files in. Other Nest 12 `createRequire(import.meta.url)` calls (`loadPackageSync`, mqtt/rmq/grpc clients) are lazy and never run in the Worker.
- **Fix:** `apps/worker/wrangler.jsonc` gets `"define": { "import.meta.url": "\"file:///worker.js\"" }`. The Worker never calls `SwaggerModule.setup`, so the `require` created from that URL is never used. `yarn nx run worker:smoke` then ends with `worker smoke: all checks ok`.
- Only that one `define` plus the two alias stubs from the table above (`@nats-io/transport-node`, `@fastify/static`) were needed for the Worker.

## How to repeat the probe

1. Branch from `dev` (stable Nx is enough; the first probe used `24.1.0-beta.0` unnecessarily). Set `@nestjs/{common,core,microservices,platform-express,testing,websockets}` to `^12`, plus `swagger`, `schematics`, `config`, `mongoose` to their 12.x (`npm view <pkg> version`). `@nx/nest` peers `<12` only produce `YN0060`; add the `packageExtensions` entry from the Correction section to silence it.
2. `yarn install`, then `yarn nx run-many -t lint test build --skip-nx-cache`. Expect `TS1479` in `libs/shared` until the tsconfigs use `module: node20` + `moduleResolution: nodenext` (`node20` is not a valid `moduleResolution`: TS6046).
3. `apps/worker/wrangler.jsonc`: add `alias` stubs for `@nats-io/transport-node` and `@fastify/static` (-> `./stubs/empty.js`); then `yarn nx run worker:smoke` is the real Workers gate.
4. Boot a built microservice to prove `require()` of ESM Nest at runtime, e.g. `AUTH_TRANSPORT=tcp AUTH_HOST=127.0.0.1 AUTH_PORT=4010 node dist/apps/microservices/auth/main.js` from `apps/microservices/auth`.
5. Update this page with the new result and the dependency-upgrades status table.

## Verdict

Do the migration on stable Nx 24.0.6; nothing external blocks it. Work list: `packageExtensions` for `@nx/nest`, `nodenext`, explicit `reflect-metadata` (each `main.ts` + vitest `setupFiles`), jest -> vitest for `ai-client`/`jobs-client`, the Worker's `define` and two alias stubs, then the install-mode scaffold smoke (yarn/npm/pnpm) and a booted gateway before release.
