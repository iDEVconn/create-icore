# Deploy workflow + SPA assets for `--host=cloudflare` (PR 6b)

Follows `2026-10-20-cloudflare-host-axis.md`. `wire-host.ts` now also: adds the `assets` binding to the generated `wrangler.jsonc`
(`../../dist/apps/client`, API first, SPA fallback), makes `worker:build` depend on `client:vite:build`, and writes
`.github/workflows/deploy-cloudflare.yml` (Node-24 action pins; credentials only from repository secrets; Worker secrets documented in
the header, never valued). `worker:smoke` checks the SPA (`/`, a deep link) when the assets binding exists.

Verified: unit tests, and an install-mode build + `worker:smoke` (SPA + API) of a freshly generated project. Not live-tested on Cloudflare:
the workflow and assets binding have not run against a real account.
