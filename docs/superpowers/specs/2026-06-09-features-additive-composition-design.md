# Features — Additive Gateway Composition (F1) — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design) — pending implementation plan
**Owner:** create-icore (`tools/create-icore`)
**Builds on:** the blueprint generator migration (providers auth/storage/db already additive; see `2026-06-09-blueprint-generator-design.md`).

## Problem

The optional features (notes / payment / jobs) are still strip-based:
`removeNotesStack` / `removePaymentStack` / `removeJobsStack` in
`tools/create-icore/src/lib/scaffold-strip.ts` perform **regex source-surgery** on
the gateway when a feature is disabled — and that surgery is exactly the bug-prone
pattern the provider migration eliminated:

- gateway `apps/api/src/app/app.module.ts` — `.replace(import …)` + `.replace(/,\s*XModule/)`
- gateway `apps/api/src/main.ts` — `GATEWAY_SERVICES` entry regex
- **`apps/client/.../LayoutSider.tsx` — the `StickyNote`/notes-`<Link>` regex (the original "bug class D")**, still live for notes
- `libs/template-shared/.../i18n/keys.ts` — `notes: { … }` block regex
- `docker-compose.yml` — `jobs:` service multi-line regex
- gateway `.env` transport blocks — `stripGatewayTransport` line filtering

Whole-directory removals (`rm apps/microservices/notes`, etc.) are NOT bug-prone —
deleting a dir produces no dangling symbols or orphan refs.

## Decision

Make the **gateway-side** feature composition additive: each composition point
becomes a thin **generated file** assembled from the chosen feature set (no regex
source-surgery). Unchosen feature **directories** keep being removed via the
manifest (safe). This is **F1**. The **client-side** tail of the notes feature
(LayoutSider nav, i18n keys, routes/queries/components) moves to the dedicated
**client phase (§7 of the blueprint spec)** — that phase's `nav.config.ts` +
clean-slate client is exactly the notes UI surface, so it is not duplicated here.

**Long-term rationale:** the durable win is killing the regex source-surgery (where
drift/orphan bugs live). `rm` of whole feature dirs is orthogonal and safe; a
future pure-additive selective-copy is an elegance optimization, not a correctness
need.

## §1 Feature manifest units

Extend the `Unit` type with a gateway-module field (distinct from the provider
`nestModule`, which carries `.forRoot` wiring — gateway feature modules are plain
imports):

```ts
// types.ts — add to Unit:
  /** A plain NestJS module the gateway app.module imports (no forRoot). */
  gatewayModule?: { importFrom: string; symbol: string };
  /** A docker-compose service block this feature owns (generated when selected). */
  dockerService?: string;
```

Populate `MANIFEST.feature` (replacing the `EMPTY` stubs):

```ts
feature: {
  notes: {
    libDirs: [
      'apps/microservices/notes', 'apps/microservices/notes-e2e', 'libs/notes-client',
      'libs/db-strategies', 'apps/api/src/app/notes', 'apps/client/src/components/notes',
    ],
    deps: { '@icore/notes-client': '*', '@casl/ability': '<real>' },
    tsPaths: { '@icore/notes-client': ['libs/notes-client/src/index.ts'] },
    gatewayModule: { importFrom: './notes/notes.module', symbol: 'NotesModule' },
    gatewayService: { name: 'notes', prefix: 'NOTES' },
    // client tail (nav/i18n/routes/components) handled in the client phase, NOT here
  },
  payment: {
    libDirs: ['apps/microservices/payment', 'apps/microservices/payment-e2e', 'libs/payment-client', 'apps/api/src/app/payment'],
    deps: { '@icore/payment-client': '*', '@idevconn/payment': '<real>' },
    tsPaths: { '@icore/payment-client': ['libs/payment-client/src/index.ts'] },
    gatewayModule: { importFrom: './payment/payment.module', symbol: 'PaymentModule' },
    gatewayService: { name: 'payment', prefix: 'PAYMENT' },
  },
  jobs: {
    libDirs: ['apps/microservices/jobs', 'libs/jobs-client', 'apps/api/src/app/admin', 'Dockerfile.ms-jobs'],
    deps: { '@icore/jobs-client': '*', '@bull-board/api': '<real>', '@bull-board/express': '<real>' },
    tsPaths: { '@icore/jobs-client': ['libs/jobs-client/src/index.ts'] },
    gatewayModule: { importFrom: './admin/admin.module', symbol: 'AdminModule' },
    // NO gatewayService (jobs registers no transport service), NO transport block
    dockerService: 'jobs',
  },
}
```

(`<real>` = the versions already in the gateway/root `package.json` — read them at
implementation time.)

`example: 'notes'` maps to the `notes` feature; `payment !== 'none'` → `payment`;
`jobs !== 'none'` → `jobs`. `resolveUnits` already pushes these (Phase 1).

## §2 Composition points — generated, not stripped

Two halves, mirroring the provider `writeProvider` + `cleanupUnusedAxis` split:

**Additive assemble (from the chosen feature set):**

| Generated file                           | Content                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/api/src/app/features.module.ts`    | `@Module({ imports: [<chosen gatewayModule symbols>] })` + their relative imports    |
| `apps/api/src/app/gateway-services.ts`   | `export const GATEWAY_SERVICES = [{ auth }, { upload }, ...<chosen gatewayService>]` |
| gateway `apps/api/.env` transport blocks | the `NOTES_*` / `PAYMENT_*` blocks of chosen features (additive write)               |
| `docker-compose.yml`                     | the `jobs:` service block appended when jobs is chosen                               |

**Subtractive-but-safe cleanup (for unchosen features):** `rm` `libDirs`, strip
`deps` from `apps/api/package.json` + `tsPaths` from `tsconfig.base.json`. No regex
on `app.module.ts` / `main.ts` — those are static and consume the generated files.

**Static (committed; never edited by the generator):**

```ts
// apps/api/src/app/app.module.ts
import { FeaturesModule } from './features.module';
@Module({ imports: [ConfigModule…, ThrottlerModule…, AuthModule, AbilitiesModule, ProfileModule, StorageModule, FeaturesModule] })

// apps/api/src/main.ts
import { GATEWAY_SERVICES } from './app/gateway-services';
```

The committed `features.module.ts` + `gateway-services.ts` reflect iCore's own
selection (all three features for the demo); the generator overwrites them per the
chosen set.

## §3 What the three strip functions lose

`removeNotesStack` / `removePaymentStack` / `removeJobsStack` are deleted. Their
responsibilities move:

| Old surgery                                                        | New owner                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| gateway app.module import/`,Module` regex                          | generated `features.module.ts`                                  |
| main.ts `GATEWAY_SERVICES` regex                                   | generated `gateway-services.ts`                                 |
| `stripGatewayTransport` (gateway .env)                             | additive transport-block write                                  |
| jobs docker-compose regex                                          | generated compose fragment                                      |
| `rm` feature MS dirs                                               | manifest `libDirs` cleanup (kept)                               |
| gateway `deps`/tsconfig strip                                      | manifest cleanup (kept)                                         |
| **notes LayoutSider / i18n / routes / queries / components regex** | **client phase (§7), via `nav.config.ts` + clean-slate client** |

After F1, `scaffold-strip.ts` retains only `removeUploadStack`,
`removeFirebaseAdminLib`, helpers — and the notes client-tail temporarily (until
the client phase), so F1 must NOT delete `removeNotesStack`'s client-surgery lines
prematurely. **F1 deletes `removePaymentStack` + `removeJobsStack` entirely, and
reduces `removeNotesStack` to its client-tail only** (gateway/main/transport/dir
parts move to the additive path; LayoutSider/i18n/routes/components stay until §7).

## §4 Generator flow change (`scaffold.ts`)

Replace the three `if (x === 'none') removeXStack()` calls with:

```ts
await cleanupUnusedFeatures(opts); // rm unchosen libDirs + strip gateway deps/tsPaths
await writeFeaturesWiring(opts); // features.module.ts + gateway-services.ts + gateway .env blocks + docker jobs fragment
// notes client tail still stripped until the client phase:
if (opts.example === 'none') await removeNotesClientTail(opts.targetDir);
```

`cleanupUnusedFeatures` reuses the generic `cleanupUnusedAxis` shape (MS pkg =
`apps/api/package.json`). `writeFeaturesWiring` is new (union, not single-provider).

## §5 Testing

- **Unit:** `writeFeaturesWiring` (pure-ish: assert generated `features.module.ts` /
  `gateway-services.ts` content for each chosen subset) + `cleanupUnusedFeatures`
  (rm + dep/tsPath strip) over temp fixtures.
- **Integration / audit:** headless-generate the feature on/off combinations
  (notes±, payment±, jobs±) → `auditProject` clean; static app.module/main.ts never
  contain feature regex artifacts; generated files import only chosen modules.
- **CI smoke matrix:** existing combos already exercise payment/jobs/notes on/off.

## Out of scope

- **Client-side notes surface** (LayoutSider nav, i18n keys, routes/queries/
  components) → the dedicated **client phase (§7)**; F1 leaves a minimal
  `removeNotesClientTail` until then.
- **Pure-additive selective copy** (never copying unchosen dirs) — elegance, not
  correctness; deferred.
- **Transport axis** (tcp/redis/… choice) — separate phase (§8).
- `blueprint.json` (§10) — separate.
