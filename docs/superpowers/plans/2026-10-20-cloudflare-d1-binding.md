# D1 via Workers binding (PR 4 of the Workers phase)

**Goal:** `D1DBStrategy` can run over a Workers D1 binding, selected by providing the `D1_DATABASE_BINDING` token.

**Spec:** `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md` (D1 binding).

- `createD1BindingClient(db: D1DatabaseLike): D1ClientLike` — structural type, no `@cloudflare/workers-types`.
- `D1DbModule.forRoot` injects the token optionally: present → binding strategy, no env; absent → existing REST/fake path.
- Tests: adapter unit tests, `runDBContract` over a `node:sqlite` fake binding, module tests (binding only, binding wins over env, fallback unchanged).
- Not live-tested on Cloudflare.
