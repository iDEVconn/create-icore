# Blueprint Generator — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design) — pending implementation plan
**Owner:** create-icore (`tools/create-icore`)

## Problem

The current `create-icore` generator ships **every** provider/feature into the
template, then removes the unchosen ones with **subtractive regex surgery**
(`tools/create-icore/src/lib/scaffold-strip.ts`). This pattern produces
recurring "orphan" bugs whenever a template drifts or a strip path is
incomplete. Confirmed instances on v0.7.2:

- **Orphan provider tests** — `auth.controller.{provider}.integration.unit.test.ts`
  survive a provider's removal and import a now-deleted `@icore/*` lib → build red.
  The strip has **no test-file logic at all**.
- **Orphan `REQUIRED_ENV` map entries** — storage strip only removes the
  `firebase:` line; `supabase`/`cloudinary`/`mongodb` lines leak.
- **Orphan raw SDK deps** — `cloudinary`, `@supabase/supabase-js` etc. are never
  pruned from microservice **or root** `package.json` (strip only touches
  `@icore/*` workspace deps; root `package.json` is never touched).
- **Sider regex drift** — notes-nav strip targets a template structure that has
  since changed, leaving unimported symbols.
- **Silent `catch {}`** around every strip block hides all of the above.

Two structural faults:

1. **Subtractive regex surgery** is brittle to template refactors and has blind
   categories (tests, raw deps, root pkg) with _no_ strip logic.
2. **No generated-project gate** — the smoke matrix is a small hand-picked sample
   that misses combinations (e.g. `shadcn × example=none`).

## Decision

Replace the subtractive generator with an **additive, blueprint/manifest-driven**
engine. **Core invariant: unchosen units are never added** — therefore there is
no strip step and orphan bugs are impossible by construction.

Scope: **big-bang — the entire generator** (all axes), reached via a safe
incremental migration sequence (see §8). Each generation selects **one** provider
per axis (no runtime multi-provider switch).

## §1 Core principle — everything is additive

Every part of the generator is a **unit** of one of four kinds:

- **provider** — auth/storage/db (supabase, firebase, mongodb, cloudinary): pick 1 of N
- **feature** — notes, payment, jobs: on/off toggle
- **ui** — shadcn/antd/mui: pick 1 of 3
- **transport** — tcp/redis/nats/mqtt/rmq/kafka: pick 1 of 6

## §2 Unit contract

Each unit declares what it contributes (never what to remove):

```ts
interface Unit {
  libDirs: string[]; // package dirs → copied iff selected
  deps: Record<string, string>; // raw deps merged into root package.json
  tsPaths: Record<string, string[]>; // aliases merged into tsconfig.base.json
  envBlock?: { file: string; lines: string };
  nestModule?: {
    // a NestJS DynamicModule the unit owns
    importFrom: string;
    symbol: string;
    into: 'auth' | 'upload' | 'notes' | 'gateway';
  };
  gatewayService?: { name: string; prefix: string }; // entry in GATEWAY_SERVICES (main.ts)
  clientNav?: { route: string; navEntry: string }; // contribution to the client sidebar/routes
}
```

## §3 Composition points — generated wiring, not stripping

The assembler writes the **union of contributions of selected units** at each
composition point:

| Point                          | Today (strip)                            | Blueprint (assemble)                               |
| ------------------------------ | ---------------------------------------- | -------------------------------------------------- |
| auth/upload/notes `app.module` | imports all + regex removes              | imports the **one** chosen provider DynamicModule  |
| gateway `app.module` imports   | all + strip Notes/Payment/Admin          | union of selected feature modules                  |
| `main.ts` GATEWAY_SERVICES     | all + strip                              | union of selected `gatewayService`                 |
| root `package.json` deps       | all + (never stripped!)                  | union of selected `deps`                           |
| `tsconfig.base.json` paths     | all + stripTsconfigPath                  | union of selected `tsPaths`                        |
| `.env` / `.env.example`        | regex blocks                             | union of selected `envBlock`                       |
| client LayoutSider/routes      | ship-with-notes + strip (StickyNote bug) | clean slate; notes-nav **added** iff example=notes |

Each point is either "copy the selected package dir" or "write a thin generated
wiring file from the union". No regex surgery anywhere.

**Notable refactor:** provider packages (`libs/auth-strategies/*`, etc.) change
their public API — construction (`makeXAuth`) moves out of `app.module.ts` into
the package as a NestJS `DynamicModule`. This touches the strategy contract tests.

## §4 Manifest (typed TS)

```ts
// tools/create-icore/src/manifest/index.ts
export const MANIFEST = {
  auth: {
    supabase: {
      libDirs: ['libs/auth-strategies/supabase'],
      deps: { '@supabase/supabase-js': '^2.106.2' },
      tsPaths: { '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'] },
      envBlock: {
        file: 'apps/microservices/auth/.env.example',
        lines: 'SUPABASE_URL=...\nSUPABASE_SERVICE_ROLE_KEY=...',
      },
      nestModule: {
        importFrom: '@icore/auth-supabase',
        symbol: 'SupabaseAuthModule',
        into: 'auth',
      },
    },
    firebase: {
      /* ... */
    },
    mongodb: {
      /* MongooseModule wiring lives inside the package */
    },
  },
  storage: {
    /* supabase, firebase, cloudinary, mongodb */
  },
  db: {
    /* supabase, firebase, mongodb */
  },
  feature: {
    notes: {
      /*...*/
    },
    payment: {
      /*...*/
    },
    jobs: {
      /*...*/
    },
  },
  ui: {
    shadcn: {
      /*...*/
    },
    antd: {
      /*...*/
    },
    mui: {
      /*...*/
    },
  },
  transport: {
    tcp: {
      /*...*/
    },
    redis: {
      /*...*/
    },
    nats: {
      /*...*/
    },
    mqtt: {
      /*...*/
    },
    rmq: {
      /*...*/
    },
    kafka: {
      /*...*/
    },
  },
} satisfies Manifest;
```

`satisfies Manifest` type-checks every entry at compile time → adding a provider
(a new package + one manifest block) is type-safe.

**firebase-admin** is a shared lib needed iff **any** of auth/db/upload = firebase.
Resolved by a union rule in the assembler, not duplicated per manifest entry.

## §5 Client (ui + additive notes-nav)

Invert today's logic. Client templates (`client-{shadcn,antd,mui}`) ship as a
**clean slate — no notes**. When `example=notes`:

- copy the notes route (`routes/_dashboard/notes.tsx`) + notes query
- **add** the notes nav entry

Mechanism: a generated **`nav.config.ts`**. The sidebar is static and maps over a
config array; the notes feature contributes one entry. Same registry principle as
providers — the sidebar component is never edited, so the StickyNote drift class
dies permanently.

## §6 Generator flow

```
1. collectOptions            (unchanged — prompts/flags)
2. resolveUnits(opts)        → list of selected Units from the manifest (pure fn)
3. copyBaseTemplate          → apps/client (chosen ui), apps/api, libs/shared, ... (always)
4. for unit of selected:     copy unit.libDirs
5. assemble(units):          (pure fn)
     - write each MS app.module wiring (one provider-module import)
     - write gateway features wiring (union)
     - merge root package.json deps (union)
     - merge tsconfig paths (union)
     - merge .env blocks (union)
     - write nav.config.ts (union clientNav)
6. audit                     (§7)
7. install / git
```

`resolveUnits` and `assemble` are **pure functions, testable without the
filesystem**. The strip functions are deleted.

## §7 Verification (audit gate)

Runs after generation; insures any architecture against regressions:

1. **Import-of-absent-lib** — no file imports an `@icore/*` package not present in
   the project (precise, false-positive-free; catches the whole orphan class).
2. **Forbidden raw dep** — no `package.json` (root + apps) holds an unchosen
   provider's SDK.
3. **Real build** — `nx run-many -t build` + service boot (as the smoke matrix
   does today).

Implemented as `tools/create-icore/scripts/audit.mjs`, invoked from
`.github/workflows/scaffold-smoke-matrix.yml`. **Expand the matrix** to cover all
3 `ui × example=none` (today `shadcn × none` is untested — the gap that shipped
the StickyNote bug).

## §8 Migration order (big-bang target, safe sequence)

Big-bang in one commit is too risky. Reach the target via increments — each its
own PR to `dev`, audit green:

| Phase | What                                                                                    | Strip deleted                 |
| ----- | --------------------------------------------------------------------------------------- | ----------------------------- |
| 1     | Manifest + `resolveUnits`/`assemble` + audit. Parallel to the old strip, not wired in   | —                             |
| 2     | Refactor provider libs → DynamicModule + `create`/`REQUIRED_ENV`. Update contract tests | —                             |
| 3     | Static MS `app.module` templates (provider-agnostic, import the wiring)                 | —                             |
| 4     | Switch the **auth** axis to blueprint                                                   | `removeUnusedAuthStrategies`  |
| 5     | Switch **storage** + **db**                                                             | their strips                  |
| 6     | Features (notes/payment/jobs) + main.ts + gateway                                       | feature strips                |
| 7     | Client: clean-slate + `nav.config` + additive notes                                     | sider strip (StickyNote dies) |
| 8     | Transport/env                                                                           | scaffold-env regex            |
| 9     | Delete `scaffold-strip.ts` entirely. Full matrix                                        | the whole file                |

Each phase is self-contained, revertable, and does not break the others.

## §9 Testing

- **Unit:** `resolveUnits(opts)` + `assemble(units)` — pure, no fs. The assembly
  logic is testable in isolation (today's strip regex is only testable through fs
  fixtures).
- **Integration:** generate real combos → audit. Expanded matrix.
- **Contract:** update `runAuthContract` / `runStorageContract` for the new
  DynamicModule provider API.

## §10 Generated `blueprint.json` (planned)

Generation writes a `blueprint.json` at the generated project's root recording
exactly what went in: the chosen unit per axis (auth/db/upload/ui/transport),
the enabled features (notes/payment/jobs), the resolved shared units
(firebase-admin), and the generator version. Produced by `assemble` from the same
`resolveUnits(opts)` result — single source of truth.

Why it earns its place:

- **Audit input:** `auditProject` reads `blueprint.json` to know the chosen set, so
  the forbidden-provider/forbidden-dep checks need no re-derivation or hardcoded
  per-combo lists in CI.
- **Idempotent re-generation / upgrades:** a future `icore add <provider>` or
  re-scaffold can read the prior selection instead of re-prompting.
- **Provenance/debugging:** "what was this project generated with?" is answerable
  from one file.

Lands alongside the `assemble` file-writing step (the phase that introduces
generated wiring files — §8 phase 3+). Schema mirrors `CreateIcoreOptions` minus
transient fields (`targetDir`, `install`, `initGit`).

## Out of scope

- Runtime multi-provider switching (one provider per generation — matches current
  behavior).
- `.env`/`.env.example` doc blocks for unchosen providers are handled additively
  by §3 (only chosen blocks are written), not as a separate strip.
