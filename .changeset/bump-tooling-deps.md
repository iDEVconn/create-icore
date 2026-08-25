---
"@idevconn/create-icore": minor
---

Bump `@changesets/cli` (^2.31.1 → ^3.0.1), `@changesets/parse` (^0.4.3 → ^1.0.0), `ioredis` (^5.11.1 → ^6.0.0), `js-yaml` (^4.3.1 → ^5.4.0), `jsdom` (~29.1.1 → ~30.0.1), `prettier` (~3.8.5 → ~3.9.6), and `webpack-dev-server` (5.2.6 → 6.0.0).

Notes:
- `js-yaml` v5 dropped `@types/js-yaml` (types are now bundled) — removed from `tools/create-icore`'s devDependencies.
- `ioredis` v6 defaults to the RESP3 wire protocol; pinned `protocol: 2` in both IORedis connection sites (`apps/microservices/jobs/src/app/redis-connection.ts`, `libs/jobs-client/src/lib/jobs-client.service.ts`) since bullmq's Lua-script reply parsing is only verified against RESP2.
- `@changesets/cli` v3's `changeset tag` → `changeset git-tag` rename and the "exit 1 on no unreleased changesets" change don't affect our workflow — `.github/workflows/release.yml` never calls the CLI directly for those cases; `changesets/action@v1` orchestrates both. That action/CLI-v3 interaction is otherwise unverifiable outside a real push to `main`.
- `webpack-dev-server` v6 requires webpack `^5.101.0` (we're on `5.109.2`) and drops CLI flags/sockjs/`bypass`/`internalIP` — none used here.
