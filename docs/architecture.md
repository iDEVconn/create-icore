# icore Architecture

High-level view of how icore is assembled. Detailed design lives in `docs/superpowers/specs/2026-05-28-icore-design.md`; build plans in `docs/superpowers/plans/`.

## Status

| Plan | Scope | State |
|------|-------|-------|
| 1 | Workspace + shared contracts (`libs/shared`) | ✅ done |
| 2 | Supabase auth MS + gateway `AuthGuard` | ⬜ pending |
| 3 | Firebase auth strategy | ⬜ pending |
| 4 | Supabase storage MS + gateway storage routes | ⬜ pending |
| 5 | Firebase + Cloudinary storage strategies | ⬜ pending |
| 6 | Client shell (Vite + shadcn + TanStack Router) | ⬜ pending |
| 7 | `@idevconn/create-icore` CLI + publish | ⬜ pending |

## Layout

```
icore/
├── apps/
│   ├── api/                 # NestJS gateway (only public surface)
│   ├── microservices/
│   │   ├── auth/            # AuthStrategy consumer
│   │   └── upload/          # StorageStrategy consumer
│   └── client/              # Vite + React 19 + shadcn
├── libs/
│   ├── shared/              # types, CASL, strategy contracts, transport helper
│   ├── auth-strategies/{supabase,firebase}/
│   ├── storage-strategies/{supabase,firebase,cloudinary}/
│   ├── auth-client/         # gateway → auth MS client (NestJS module)
│   └── upload-client/       # gateway → upload MS client (NestJS module)
└── tools/
    └── create-icore/        # npx CLI source
```

## Shared library (`libs/shared`) — current contents

- `defineAbilitiesFor(user)` — single source of truth for CASL rules. Used by both server (`AbilityGuard`) and client (`<AbilityProvider>`).
- `AuthStrategy` / `StorageStrategy` — provider-agnostic contracts in `src/strategies/`.
- `runAuthContract(name, factory)` / `runStorageContract(name, factory)` — re-runnable Vitest suites; every concrete strategy lib runs them.
- `FakeAuthStrategy` / `FakeStorageStrategy` — in-memory reference implementations. Pass the contract suites, double as test stand-ins for the future gateway/MS smoke E2E.
- `buildTransport(prefix)` — reads `${prefix}_TRANSPORT` env (`tcp` | `redis` | `nats`) and returns NestJS `ClientOptions`. Same helper on gateway and inside each MS `main.ts` so the transport choice is environment-driven.

## Strategy pattern

Both auth and storage hide behind a single interface. NestJS module wires a factory provider that reads the provider name from `ConfigService` and returns the concrete strategy. Three env layers:

| Layer | Owner | Example vars |
|-------|-------|--------------|
| Transport wiring | gateway + each MS | `AUTH_TRANSPORT`, `AUTH_HOST`, `AUTH_PORT`, `UPLOAD_TRANSPORT`, … |
| Provider selection | per microservice | `AUTH_PROVIDER` (`supabase` \| `firebase`), `STORAGE_PROVIDER` (`supabase` \| `firebase` \| `cloudinary`) |
| Provider credentials | concrete strategy | `SUPABASE_*`, `FB_ADMIN_*`, `CLOUDINARY_*` |

`libs/shared` is env-free. Env IO happens at the MS module boundary.

## Conventions

- Generators only — `yarn nx g @nx/<plugin>:<schematic>`. Never hand-write `project.json`.
- Tests live in `src/**/__tests__/` next to the source they exercise.
- One responsibility per file.
- Strategy libs depend on `@icore/shared` for the contract; they do not depend on `@nestjs/*` runtime — DI wiring happens in the consuming MS module.
- Yarn 4 with `nodeLinker: node-modules` (NOT PnP — PnP blocks `nx g` generators that spawn yarn via corepack).
- NestJS apps and MSes set `module: node16, moduleResolution: node16` in their tsconfig. Vite client sets `moduleResolution: bundler`. `tsconfig.base.json` deliberately leaves both unset so each project picks what it needs.

## Cross-links

- Detailed design + decision log → `docs/superpowers/specs/2026-05-28-icore-design.md`
- Plan-by-plan build sequence → `docs/superpowers/plans/`
- Day-to-day agent rules → `AGENTS.md`
- Provider setup walk-throughs → `AGENTS.md` § Provider-specific Setup
