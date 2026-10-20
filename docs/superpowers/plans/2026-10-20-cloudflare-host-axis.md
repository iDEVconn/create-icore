# `create-icore --host=cloudflare` (PR 6a of the Workers phase)

**Spec:** `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md` (create-icore).

Done: `host` axis (flag, wizard question, config key, `blueprint.json`), `local` transport and `durable-object` session values,
`validateOptions` errors for unsupported combinations (thrown by `resolveBindings` before anything is written), manifest unit
`host.cloudflare` (`apps/worker`), Node-only artifacts excluded, `wire-host.ts` (per-feature `hosted-apps.ts`, wrangler vars + D1 binding,
`.dev.vars.example`, dev port, root `dev` script), `apps/worker` added to `snapshot-templates`, smoke script + CI combos.

Rulings:

- Split of PR 6: this PR (6a) generates a working Worker project; the deploy workflow and the SPA assets binding are 6b.
- Unsupported combinations are errors, not silent corrections; only the implied transport/session are filled in.
- `D1_DATABASE_BINDING` and `D1DatabaseLike` moved to `@icore/shared` (re-exported by `@icore/db-d1`): a project without D1 must not make the Worker import the D1 lib.
- Worker hosts zero-or-more microservices; `removeStrategiesLib` is skipped for Cloudflare because the bootstrap needs `buildTransportMS`.
- Side fix: for `auth=none`, `csrf.guard.unit.test.ts` (imports the removed auth controller) is excluded, which also fixes the Node `auth=none` typecheck.

Verified: unit tests, link-mode typecheck of four cloudflare combos, install-mode build + `worker:smoke` of three (full, auth-only, auth=none + r2).
Not live-tested on Cloudflare.
