# iCore

> Bootstrap scaffold for Nx + NestJS + React projects with swappable auth + storage providers.

iCore is the monorepo that powers [`@idevconn/create-icore`](https://www.npmjs.com/package/@idevconn/create-icore) — the CLI that scaffolds new full-stack projects in seconds. One command, your choice of providers, and a runnable monorepo on the other end.

## Quick start (consumers)

```bash
npm init @idevconn/icore my-saas -- \
  --auth=supabase \
  --db=supabase \
  --upload=supabase \
  --ui=shadcn
```

The CLI prompts (interactive) or accepts flags (non-interactive) for:

| Dimension       | Choices                                                      |
| --------------- | ------------------------------------------------------------ |
| **Auth**        | Supabase, Firebase                                           |
| **Database**    | Supabase, Firebase (mirrors auth in v0.1.0)                  |
| **File upload** | Supabase Storage, Firebase Cloud Storage, Cloudinary, `none` |
| **UI library**  | shadcn/Tailwind (antd + MUI tracked for v0.2)                |
| **Transport**   | TCP, Redis, NATS                                             |

After scaffolding:

```bash
cd my-saas
yarn dev          # gateway + auth MS + upload MS + client
# → http://localhost:4200  (Vite client)
# → http://localhost:3001/api/docs  (Swagger UI)
```

Full CLI docs: [`tools/create-icore/README.md`](./tools/create-icore/README.md).

## What's inside the scaffold

| Layer         | Stack                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| Monorepo      | Nx 22.7 + yarn 4                                                                |
| Gateway       | NestJS 11 + Swagger + Throttler + CASL guards                                   |
| Auth MS       | Supabase or Firebase via `AuthStrategy` factory + `ADMINS_LIST` auto-admin      |
| Upload MS     | Supabase / Firebase / Cloudinary via `StorageStrategy` factory (or opt-out)     |
| Transports    | TCP / Redis / NATS — same env contract on both sides                            |
| Client        | Vite 6 + React 19 + Tailwind 4 + shadcn + TanStack Router + Query + Zustand     |
| i18n          | i18next + react-i18next (en / ru / he with RTL)                                 |
| Form blocking | `@idevconn/use-draft` — global dirty-state with router + browser-close blocking |
| Tests         | Vitest 4 unit + Playwright smoke                                                |
| Publish       | changesets + OIDC trusted publishing + npm provenance                           |
| CI            | nx affected lint/test/build matrix + auto sync-main-to-dev                      |

## Layout

```
icore/
├── apps/
│   ├── api/                              # NestJS gateway
│   ├── microservices/{auth,upload}/      # @MessagePattern handlers
│   └── templates/client-shadcn/          # Vite + shadcn template
├── libs/
│   ├── shared/                           # contracts, CASL, transport helper, in-memory fakes
│   ├── auth-strategies/{supabase,firebase}/
│   ├── storage-strategies/{supabase,firebase,cloudinary}/
│   ├── auth-client/                      # gateway → auth MS client
│   ├── upload-client/                    # gateway → upload MS client
│   └── template-shared/                  # library-agnostic React foundation
└── tools/
    └── create-icore/                     # the published CLI
```

## Contributing

1. Default working branch is `dev`. `main` is the deploy / publish target — promoted manually.
2. Feature branches cut from `dev`. PRs target `dev`.
3. Every push runs the nx-affected matrix in `.github/workflows/pipeline.yml`.
4. Changesets drive the npm release flow — add a `.changeset/*.md` for any consumer-facing change to `@idevconn/create-icore`.
5. Internal `@icore/*` libs are ignored by changesets (never published).

Full agent + contributor rules: [`AGENTS.md`](./AGENTS.md). Architecture overview: [`docs/architecture.md`](./docs/architecture.md). Spec + plans: [`docs/superpowers/`](./docs/superpowers/).

## License

Apache-2.0 — see [`LICENSE`](./LICENSE).
