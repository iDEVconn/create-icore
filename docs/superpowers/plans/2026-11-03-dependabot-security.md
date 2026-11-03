# Dependabot security alerts: fix plan

Source: `repos/iDEVconn/create-icore/dependabot/alerts` (open alerts on `main`), audited 2026-11-03.

## Problem

143 open alerts (6 critical, 63 high, 62 medium, 12 low; 77 runtime, 66 development). Almost all are transitive packages that only appear in `yarn.lock`. After the minor/patch bump (PR #380) 23 are already fixed in the lock; **120 alerts across ~40 packages remain**. Alerts track `main`, so they close only after `dev` is promoted.

## Plan

0. Land #380 in `dev`. Work on `chore/deps-security`.
1. **Critical + runtime, lock only** (`yarn up -R <pkg>`): `websocket-driver`, `proxy-addr`, `shell-quote`, `piscina`, `@xhmikosr/decompress`; runtime highs `undici`, `axios`, `ip-address`, `follow-redirects`, `@fastify/busboy`, `body-parser`, `@grpc/grpc-js`, `multer`, `zod`, `js-yaml`, `decode-uri-component`, `qs`, `protobufjs`, `seroval`.
2. **Dev tooling, lock only**: `fast-uri`, `brace-expansion`, `postcss`, `svgo`, `launch-editor`, `immutable`, `source-map-js`, `compression`, `browserslist`, `form-data`, `tar`, `postcss-selector-parser`, `baseline-browser-mapping`, `serialize-javascript`, `esbuild`.
3. **Parent pins**: root `resolutions` for what `yarn up -R` cannot move; every entry gets a reason and a removal condition. Confirm `resolutions` do not leak into `_template-shell`.
4. **Major mismatches**, one by one: `glob` (need 14), `minimatch` (need 11), `uuid` (need 11.1.1), `stream-json` (need >=3.5). Find the parent (`yarn why`), bump it, or use `resolutions` when the API is compatible; otherwise dismiss dev-only alerts with a reason. `deepmerge` (low) has no patch: dismiss.
5. **Verify after every step**: `yarn install --immutable`, `yarn nx run-many -t lint test build`, install-mode smoke (yarn + pnpm, `jobs=bullmq`), and re-run the lock vs alert range check.
6. **Lock in**: group security updates in `.github/dependabot.yml`, add `yarn npm audit --severity high` to CI (warning first, then gate), document in `docs/runbooks/dependency-upgrades.md`.

## Risks

- `undici` / `axios` / `follow-redirects` bumps touch every HTTP client (Supabase, Firebase, PayPal, LLM): exercise a real request in smoke, not only the build.
- `resolutions` can diverge from peer ranges: no new `YN0060` warnings allowed.
- Every change touches `yarn.lock`: merge fast to avoid conflicts.
