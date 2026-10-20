# `apps/worker` (PR 5 of the Workers phase)

**Goal:** a Worker that hosts the gateway and the auth/upload/notes microservices in one isolate, using PR 2–4's pieces.

**Spec:** `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md` (Topology, Entry point and lifecycle, Build).

Done: generated with `@nx/nest:app`, then reshaped (no webpack; `build` = `tsc` + `wrangler deploy --dry-run`; `serve`/`smoke` via `wrangler dev --local`).
`apps/api` gained one optional branch: `SESSION_STORE=durable-object` (token `SESSION_DO_NAMESPACE`, provided only by the Worker).

Rulings:

- The Worker composes the gateway from `apps/api`'s feature modules (`gateway.module.ts`) instead of importing `AppModule`, because `AppModule` pulls in
  `FeaturesModule` (payment, ai, bull-board admin) which need a long-lived process. PR 6 will generate this list per project.
- `wrangler` is a devDependency of `apps/worker` (yarn.lock updated); `@nestjs/websockets`, `class-validator` and `class-transformer` are declared
  there because Nest `require`s them optionally and the bundler must resolve them.
- The smoke runs in CI's `build` job with `nx affected -t smoke`; it needs no Cloudflare account.
- `apps/worker` is not listed in `snapshot-templates`, so generated projects do not contain it yet.

Not done / not live-tested: deployment, D1 binding exercised end to end (the repo's notes microservice still selects Supabase), R2, assets binding.
