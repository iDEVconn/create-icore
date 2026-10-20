# Cloudflare Workers G0 measurement harness

Throwaway harness for gate G0 of `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md`.
It is **not** a Yarn workspace member: install and run it with `npm` from this folder.

```
npm install
npm run build        # tsc (decorator metadata) → build/, writes tsconfig.bundle.json
npm run dev          # wrangler dev --local --port 8787
npm run check:canary # proves implicit constructor injection survives the build
```

Results of the live measurement are in `RESULTS.md`.

## The gateway slice (Task 2)

`src/g0.module.ts` mirrors `apps/api`'s `AppModule` + `AuthModule` for the routes the measurement
exercises. `src/bootstrap.ts` starts the auth microservice (`apps/microservices/auth`'s real
`AppModule`, fake auth strategy via the dev fallback) with an in-process `LocalServer('AUTH')`, and
the gateway as a second Nest application, both lazily on the first request.

Routes: `POST /api/auth/register|login|logout`, `GET /api/auth/session`, `GET /api/profile`,
`POST /api/auth/admin/revoke-user/:uid` (CSRF check), plus public probes `GET /g0/health`,
`/g0/canary`, `/g0/presign`, `/g0/supabase`, `/g0/env`. `npm run check:slice` drives them.

### Substitutions (everything else is the repo's own code)

- `AuthClientModule.forRoot()` (TCP/Redis transport from env) → `SliceAuthClientModule`: the same
  `AuthClientService` over an in-process `LocalClientProxy` (G0-only copy of the `local` transport
  that PR 2 adds to `libs/shared`).
- `SESSION_STORE=memory` (`InMemorySessionStore`) instead of Redis or a Durable Object.
- The auth microservice runs with the fake auth strategy (no Supabase credentials in G0).
- `AUTH_TCP_SECRET` is a throwaway value from `.dev.vars` (local) or `wrangler secret` (deployed).
- Feature modules (storage, notes, payment, jobs, ai) are not part of the slice.

### Build notes

- Wrangler resolves every bare import from `node_modules` next to the compiled file, so the
  harness depends on every package the imported repo sources need (`@nestjs/swagger`,
  `@casl/ability`, …); a package missing here would otherwise resolve from the repo root and drag
  in a second copy of its dependencies.
- `alias` stubs the optional Nest transports; `class-transformer/storage` is aliased to its real
  file (Nest's `mapped-types` requires it inside a try/catch that webpack normally satisfies).
- Local `wrangler deploy --dry-run` of the slice: **6341 KiB total upload, 1193 KiB gzip**.
