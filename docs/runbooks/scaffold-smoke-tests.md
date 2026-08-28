# Scaffold smoke tests

## Problem

Unit tests on the scaffolder (`scaffold.unit.test.ts`) only assert that the
**strip regexes produce the expected text**. They never compile or run the
generated project, so the whole class of "the output text doesn't actually
work" bugs slips through and is only discovered after publishing to npm:

- `TS2304: Cannot find name 'expect'` (test DSL leaking into the build surface)
- dangling `makeFirebase*` / `getFirebaseAdmin` references after pruning
- a missing dependency (`nats`), an out-of-date `yarn.lock`
- a service that **crashes at runtime** on a missing `.env` or a down broker
  instead of degrading to a banner + fake

The only real validation is: scaffold a project → install → build → **boot it**.

## Solution — two layers

Driven by `tools/create-icore/scripts/smoke-scaffold.mjs`, which calls the real
`scaffold()` against the committed `templates/` snapshot.

### Layer A — typecheck (cheap, every PR)

`pipeline.yml` → `scaffold-smoke` job. For each combo it builds the CLI,
regenerates the template snapshot from the **current** source, scaffolds into a
temp dir, symlinks this repo's `node_modules` (no install, no network) and runs
`tsc --noEmit` over the generated tsconfigs.

The four combos are a **covering set**: every value of every server-affecting
option appears at least once — `auth` {supabase, firebase}, `db`
{supabase, firebase}, `upload` {supabase, firebase, cloudinary, none},
`payment` {paypal, none}, `jobs` {bullmq, none}, `example` {notes, none},
`transport` {tcp, redis, nats}. Cheap enough (~seconds each, no install) to run
all four on every PR. The `client`/`ui` variants (shadcn/antd/mui) need a real
Vite build — `tsc` alone can't type the client (DOM lib + TanStack Router
codegen) — so they're covered in Layer B, not here.

- Catches the compile class (TS2304, dangling refs, bad pruning).
- Does **not** use `nx build`/`serve` — those executors validate
  `externalDependencies` against the workspace package graph, which a
  no-install symlink can't satisfy. Hence raw `tsc`.

Run locally:

```bash
yarn nx build create-icore
node tools/create-icore/scripts/snapshot-templates.mjs
node tools/create-icore/scripts/smoke-scaffold.mjs \
  --auth=supabase --db=supabase --upload=cloudinary --transport=tcp --mode=link
# or: cd tools/create-icore && npm run smoke
```

### Layer B — install + build + boot (full fidelity, nightly / on-demand)

`scaffold-smoke-matrix.yml` → `workflow_dispatch` + nightly. Matrix over
package-manager (`npm`/`pnpm`/`yarn`) × the same 4-combo covering set, but here
each combo also carries a `ui` (shadcn/antd/mui — covered across the four) and
builds `client`, so the real **Vite** build runs. Real install, real
`nx build`, then boots the services (`nx run-many -t serve`) for ~25s and
asserts each stays up without exiting or printing a crash marker. Services that
a combo doesn't generate are trimmed automatically.

- Catches lockfile / dependency-pruning / package-manager-runner breakage and
  **runtime** crashes.
- Non-blocking — run it from the Actions tab before promoting `dev → main`.

Run locally:

```bash
cd tools/create-icore && npm run smoke:run            # default combo, npm
# or full control:
node scripts/smoke-scaffold.mjs --auth=firebase --db=firebase --upload=firebase \
  --pm=pnpm --mode=install --run --run-seconds=25
```

## Known findings

- **`npm ERESOLVE` for PayPal/payment + API Express** — If Layer B fails during
  `npm install` with `@idevconn/payment` requesting `express@^5.0.0`, check
  `apps/api/package.json` first. The generated API workspace must stay on
  Express 5 (`express@^5.2.1` and `@types/express@^5`) because
  `@idevconn/payment@1.2.x`, `@bull-board/express@7.x`, and Nest 11's
  `@nestjs/platform-express` stack are all Express-5-compatible. After changing
  the source package, run `yarn nx build create-icore` so the ignored template
  snapshot used by the smoke script is regenerated before reproducing the
  nightly job.
- **`@casl/ability` TS7016 under npm/pnpm** — Layer B surfaced that a
  generated project installed with `npm` fails `notes-client:build`:
  `Could not find a declaration file for module '@casl/ability'`. iCore itself
  (yarn node-modules linker) builds it fine — a yarn-vs-npm module-resolution
  gap (`moduleResolution: node10` not reading the package's `exports`/types).
  Tracked as a separate fix; Layer B is non-blocking until then.
- **`TS5103: Invalid value for '--ignoreDeprecations'`** — the 2026-08-25 NX
  migration bumped iCore's own `typescript` to `6.0.3` and added
  `"ignoreDeprecations": "6.0"` to every tsconfig, including the ones the
  blueprint engine copies into scaffolded projects. `_template-shell/package.json`
  still pinned `typescript@^5.9.3`, which doesn't recognize `"6.0"` as a valid
  `ignoreDeprecations` target — every `pm × combo` in the Layer B matrix failed
  identically on `shared:build`. Fix: keep the scaffold's `typescript` dep in
  lockstep with the root's whenever a future NX/TS migration bumps the root
  version and touches `ignoreDeprecations`.
