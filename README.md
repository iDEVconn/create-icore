# iCore

> Bootstrap scaffold for Nx + NestJS + React projects with swappable auth, storage, db, payment, and jobs providers.

iCore is the monorepo that powers [`@idevconn/create-icore`](https://www.npmjs.com/package/@idevconn/create-icore) — the CLI that scaffolds new full-stack projects in seconds. One command, your choice of providers, and a runnable monorepo on the other end.

## Quick start (consumers)

Pick whichever package manager you already have. All three resolve to the same `@idevconn/create-icore` binary.

```bash
# npm
npm init @idevconn/icore@latest my-saas -- --auth=supabase --db=supabase --upload=supabase --ui=shadcn

# yarn (4+)
yarn create @idevconn/icore@latest my-saas --auth=supabase --db=supabase --upload=supabase --ui=shadcn

# pnpm
pnpm create @idevconn/icore my-saas --auth=supabase --db=supabase --upload=supabase --ui=shadcn

# bunx (no installer ceremony)
bunx @idevconn/create-icore my-saas --auth=supabase --db=supabase --upload=supabase --ui=shadcn
```

More combos:

```bash
# Mix-and-match: Firebase auth + Supabase Postgres + Cloudinary uploads
npm init @idevconn/icore my-saas -- --auth=firebase --db=supabase --upload=cloudinary --ui=shadcn

# Full stack with payments + jobs (BullMQ requires Redis)
yarn create @idevconn/icore my-saas \
  --auth=supabase --db=supabase --upload=supabase \
  --payment=paypal --jobs=bullmq \
  --ui=antd --transport=redis

# Material UI + Firebase, nothing fancy
pnpm create @idevconn/icore my-saas --auth=firebase --db=firebase --upload=cloudinary --ui=mui

# Skip all add-ons, just gateway + auth + shadcn
npm init @idevconn/icore my-app -- --auth=supabase --db=supabase --upload=none
```

The CLI prompts (interactive) or accepts flags (non-interactive) for:

| Dimension       | Choices                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| **Auth**        | Supabase, Firebase — both support password + magic-link + OAuth (Google/GitHub) |
| **Database**    | Supabase Postgres or Firestore — fully independent of `--auth`                  |
| **File upload** | Supabase Storage, Firebase Cloud Storage, Cloudinary, `none`                    |
| **Payment**     | PayPal via `@idevconn/payment`, or `none` (opt-in)                              |
| **Jobs**        | BullMQ + bull-board admin UI, or `none` (opt-in, requires Redis)                |
| **UI library**  | shadcn/Tailwind, **Ant Design**, **MUI**                                        |
| **Transport**   | TCP, Redis, NATS                                                                |

After scaffolding:

```bash
cd my-saas
yarn dev          # gateway + auth MS + upload MS (+ payment/notes/jobs if opted in) + client
# → http://localhost:4200  (Vite client)
# → http://localhost:3001/api/docs  (Swagger UI)
# → http://localhost:3001/api/admin/queues  (bull-board, when --jobs=bullmq)
```

Or run the whole backend stack in docker via `docker compose up` (see [`docs/runbooks/local-docker.md`](./docs/runbooks/local-docker.md)).

Full CLI docs: [`tools/create-icore/README.md`](./tools/create-icore/README.md).

## What's inside the scaffold

| Layer         | Stack                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Monorepo      | Nx 22.7 + yarn 4                                                                                      |
| Gateway       | NestJS 11 + Swagger + Throttler + CASL guards + cookie-parser (OAuth state)                           |
| Auth MS       | Supabase or Firebase via `AuthStrategy` (password + magic-link + Google/GitHub OAuth) + `ADMINS_LIST` |
| Upload MS     | Supabase / Firebase / Cloudinary via `StorageStrategy` factory (or opt-out)                           |
| Notes sample  | Owner-scoped CRUD via `DBStrategy` + gateway + 3-template UI (demo of the full stack)                 |
| Payment MS    | `@idevconn/payment` registry (PayPal default) — opt-in via `--payment=paypal`                         |
| Jobs MS       | BullMQ workers (email / image-process / cleanup stubs) + bull-board admin UI — opt-in `--jobs=bullmq` |
| Transports    | TCP / Redis / NATS — same env contract across all MSes                                                |
| Client        | Vite 6 + React 19 + shadcn/Tailwind 4 or Ant Design 6 or MUI 6 + TanStack Router + Query + Zustand    |
| i18n          | i18next + react-i18next (en / ru / he with RTL)                                                       |
| Form blocking | `@idevconn/use-draft` — global dirty-state with router + browser-close blocking                       |
| Tests         | Vitest 4 unit + Playwright smoke                                                                      |
| Docker        | `Dockerfile.{gateway,ms-auth,ms-upload,ms-jobs}` + `docker-compose.yml` (gateway + MSes + redis)      |
| Publish       | changesets + OIDC trusted publishing + npm provenance                                                 |
| CI            | nx affected lint/test/build matrix + docker build matrix (main only) + auto sync-main-to-dev          |

## Layout

```
icore/
├── apps/
│   ├── api/                                       # NestJS gateway
│   ├── microservices/
│   │   ├── auth/                                  # @MessagePattern: verify/login/signup/refresh/magicLink/oauth
│   │   ├── upload/                                # @MessagePattern: storage.upload/remove/signedUrl/list
│   │   ├── payment/                               # @MessagePattern: payment.createOrder/captureOrder (opt-in)
│   │   ├── notes/                                 # @MessagePattern: notes.list/get/create/update/delete (sample)
│   │   └── jobs/                                  # BullMQ Workers (opt-in)
│   └── templates/{client-shadcn,client-antd,client-mui}/  # Vite + 3 UI variants
├── libs/
│   ├── shared/                                    # contracts, CASL, transport, Note + Jobs types, in-memory fakes
│   ├── auth-strategies/{supabase,firebase}/
│   ├── storage-strategies/{supabase,firebase,cloudinary}/
│   ├── db-strategies/{supabase,firestore}/
│   ├── auth-client/                               # gateway → auth MS
│   ├── upload-client/                             # gateway → upload MS
│   ├── payment-client/                            # gateway → payment MS
│   ├── notes-client/                              # gateway → notes MS
│   ├── jobs-client/                               # any consumer → Redis (BullMQ Queue)
│   └── template-shared/                           # library-agnostic React foundation
├── Dockerfile.{gateway,ms-auth,ms-upload,ms-jobs}
├── docker-compose.yml
└── tools/
    └── create-icore/                              # the published CLI
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
