# Blueprint Generator — Phase 2c: DB Provider DynamicModules

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Add a self-contained NestJS `DynamicModule` (`forRoot(envPath)`) to each DB strategy lib (supabase / firestore / mongodb), mirroring Phases 2a (auth) + 2b (storage). **Additive, libs-only:** strategy classes, contract tests, the notes `app.module.ts`, and the generator are untouched. A later wiring PR (Phase 2c-wire) makes the notes MS import one chosen module + deletes `removeUnusedDbStrategies` + extracts the shared `wire-provider` helper.

**Architecture:** Each db lib exports `XDbModule.forRoot(envPath)` providing+exporting the `'DBStrategy'` token via `buildStrategyWithFallback`, with a `*_DB_REQUIRED_ENV` constant. mongodb owns its `MongooseModule.forRootAsync` + connection injection; firestore uses `getFirebaseAdmin(cfg).firestore()`; supabase uses a Supabase client.

**Tech Stack:** NestJS DynamicModule + `@nestjs/testing`, Vitest/Jest. Edit the tracked root `libs/` (NOT `tools/create-icore/templates/`). Test: `yarn nx test db-supabase|db-firestore|db-mongodb|shared`.

> **CRITICAL naming quirks (verified):**
>
> - The `firebase` DB provider's **lib dir is `firestore`** (`libs/db-strategies/firestore`), package `@icore/db-firestore`, class **`FirestoreDBStrategy`**, manifest symbol **`FirestoreDbModule`**.
> - mongodb class is **`MongoDbDBStrategy`** (camelCase `Db` then `DB`); manifest symbol **`MongoDbDbModule`**.
> - supabase class **`SupabaseDBStrategy`**; symbol **`SupabaseDbModule`**.
> - **Token** `'DBStrategy'`. **Service label** `'notes MS'`. **Fake** `FakeDBStrategy` (from `@icore/shared`).
> - Match the manifest `nestModule.symbol` names EXACTLY: `SupabaseDbModule` / `FirestoreDbModule` / `MongoDbDbModule`.

> **Env (verified):** supabase `['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']`; firestore `[...FIREBASE_ADMIN_REQUIRED_ENV]` (no extra bucket var); mongodb `['MONGODB_URI']`.

---

## File Structure

Under `libs/db-strategies/<dir>/` (dirs: `supabase`, `firestore`, `mongodb`):

- Create: `<dir>/src/lib/<name>-db.module.ts` (names: `supabase-db.module.ts`, `firestore-db.module.ts`, `mongodb-db.module.ts`)
- Modify: `<dir>/src/index.ts` — append the module export
- Test: `<dir>/src/lib/__tests__/<name>-db.module.unit.test.ts`
- Modify: each `<dir>/package.json` (NestJS deps, Task 4) + `<dir>/tsconfig.json` (decorator flags)
- Create: `.changeset/blueprint-phase2c.md`

Strategy classes + contract tests are NOT modified.

---

### Task 1: `SupabaseDbModule`

**Files:** Create `libs/db-strategies/supabase/src/lib/supabase-db.module.ts` + test; modify `src/index.ts`.

- [ ] **Step 1: Failing test** — `libs/db-strategies/supabase/src/lib/__tests__/supabase-db.module.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseDbModule, SUPABASE_DB_REQUIRED_ENV } from '../supabase-db.module.js';
import { SupabaseDBStrategy } from '../supabase-db.strategy.js';

let ENV: Record<string, string | undefined> = {};
@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: { get: (k: string) => ENV[k], getOrThrow: (k: string) => ENV[k] },
    },
  ],
  exports: [ConfigService],
})
class StubConfigModule {}

describe('SupabaseDbModule', () => {
  it('declares its required env', () => {
    expect(SUPABASE_DB_REQUIRED_ENV).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });
  it('provides a real SupabaseDBStrategy under DBStrategy when env present', async () => {
    ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, SupabaseDbModule.forRoot('.env')],
    }).compile();
    expect(ref.get('DBStrategy')).toBeInstanceOf(SupabaseDBStrategy);
  });
});
```

- [ ] **Step 2: Run → fail** (`yarn nx test db-supabase -- supabase-db.module`).

- [ ] **Step 3: Implement** — `supabase-db.module.ts`

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { SupabaseDBStrategy } from './supabase-db.strategy';

export const SUPABASE_DB_REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

@Module({})
export class SupabaseDbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: SupabaseDbModule,
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'supabase',
              requiredEnv: SUPABASE_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new SupabaseDBStrategy({
                  client: createClient(
                    cfg.getOrThrow<string>('SUPABASE_URL'),
                    cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
                    { auth: { autoRefreshToken: false, persistSession: false } },
                  ),
                }),
              fake: () => new FakeDBStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['DBStrategy'],
    };
  }
}
```

- [ ] **Step 4: Export** — append to `libs/db-strategies/supabase/src/index.ts`: `export * from './lib/supabase-db.module';`
- [ ] **Step 5: Run → pass** (module test + `yarn nx test db-supabase` contract still green).
- [ ] **Step 6: Commit** `feat(db-supabase): SupabaseDbModule DynamicModule`.

---

### Task 2: `FirestoreDbModule` (firebase provider → firestore lib)

**Files:** Create `libs/db-strategies/firestore/src/lib/firestore-db.module.ts` + test; modify `src/index.ts`.

- [ ] **Step 1: Failing test** — assert `FIRESTORE_DB_REQUIRED_ENV` contains `'FB_ADMIN_PROJECT_ID'`; dev-fallback path returns a fake (a `DBStrategy` with a `get` function) without touching firebase-admin (NODE_ENV='development', stub cfg returns undefined, spy console.warn). Mirror the storage-firebase test. File `.../firestore/src/lib/__tests__/firestore-db.module.unit.test.ts`.

```ts
import { describe, it, expect, vi } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FirestoreDbModule, FIRESTORE_DB_REQUIRED_ENV } from '../firestore-db.module.js';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: () => undefined,
        getOrThrow: () => {
          throw new Error('missing');
        },
      },
    },
  ],
  exports: [ConfigService],
})
class StubConfigModule {}

describe('FirestoreDbModule', () => {
  it('requires the firebase-admin env', () => {
    expect(FIRESTORE_DB_REQUIRED_ENV).toContain('FB_ADMIN_PROJECT_ID');
  });
  it('falls back to the fake (dev) when env missing, without touching firebase-admin', async () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, FirestoreDbModule.forRoot('.env')],
    }).compile();
    expect(typeof (ref.get('DBStrategy') as { get: unknown }).get).toBe('function');
    delete process.env.NODE_ENV;
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — `firestore-db.module.ts`

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { FirestoreDBStrategy } from './firestore-db.strategy';

export const FIRESTORE_DB_REQUIRED_ENV = [...FIREBASE_ADMIN_REQUIRED_ENV];

@Module({})
export class FirestoreDbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: FirestoreDbModule,
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'firestore',
              requiredEnv: FIRESTORE_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                const app = getFirebaseAdmin(cfg);
                return new FirestoreDBStrategy({
                  db: app.firestore() as unknown as ConstructorParameters<
                    typeof FirestoreDBStrategy
                  >[0]['db'],
                });
              },
              fake: () => new FakeDBStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['DBStrategy'],
    };
  }
}
```

- [ ] **Step 4: Export** — append to `libs/db-strategies/firestore/src/index.ts`: `export * from './lib/firestore-db.module';`
- [ ] **Step 5: Run → pass** (module test + `yarn nx test db-firestore` contract green).
- [ ] **Step 6: Commit** `feat(db-firestore): FirestoreDbModule DynamicModule`.

---

### Task 3: `MongoDbDbModule` (owns Mongoose wiring)

**Files:** Create `libs/db-strategies/mongodb/src/lib/mongodb-db.module.ts` + test; modify `src/index.ts`.

- [ ] **Step 1: Failing test** — shape assertions (mongo auto-connects on boot, so don't compile/boot it). `storage-mongodb`/`auth-mongodb` use **Jest** — check `db-mongodb`'s test runner: inspect `libs/db-strategies/mongodb` for `jest.config.*` vs `vitest.config.*` and match it (its existing `mongodb-db.strategy.unit.test.ts` shows the convention — bare globals + no `.js` if Jest). File `.../mongodb/src/lib/__tests__/mongodb-db.module.unit.test.ts`:

```ts
import { MongoDbDbModule, MONGODB_DB_REQUIRED_ENV } from '../mongodb-db.module';

describe('MongoDbDbModule', () => {
  it('requires the mongo uri', () => {
    expect(MONGODB_DB_REQUIRED_ENV).toEqual(['MONGODB_URI']);
  });
  it('forRoot returns a DynamicModule importing Mongoose and exporting DBStrategy', () => {
    const dm = MongoDbDbModule.forRoot('.env');
    expect(dm.module).toBe(MongoDbDbModule);
    expect(dm.exports).toContain('DBStrategy');
    expect(Array.isArray(dm.imports)).toBe(true);
    expect((dm.imports ?? []).length).toBeGreaterThan(0);
  });
});
```

> If `db-mongodb` uses Vitest (not Jest), add the vitest imports + `.js` extension on the relative import. Determine from the lib's config before writing.

- [ ] **Step 2: Run → fail** (`yarn nx test db-mongodb -- mongodb-db.module`).

- [ ] **Step 3: Implement** — `mongodb-db.module.ts`

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { MongoDbDBStrategy } from './mongodb-db.strategy';

export const MONGODB_DB_REQUIRED_ENV = ['MONGODB_URI'];

@Module({})
export class MongoDbDbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: MongoDbDbModule,
      imports: [
        MongooseModule.forRootAsync({
          useFactory: (cfg: ConfigService) => ({ uri: cfg.get<string>('MONGODB_URI') }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService, connection: Connection): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'mongodb',
              requiredEnv: MONGODB_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => new MongoDbDBStrategy({ connection }),
              fake: () => new FakeDBStrategy(),
            }),
          inject: [ConfigService, getConnectionToken()],
        },
      ],
      exports: ['DBStrategy'],
    };
  }
}
```

- [ ] **Step 4: Export** — append to `libs/db-strategies/mongodb/src/index.ts`: `export * from './lib/mongodb-db.module';`
- [ ] **Step 5: Run → pass** (module test + `yarn nx test db-mongodb` strategy test green).
- [ ] **Step 6: Commit** `feat(db-mongodb): MongoDbDbModule with own Mongoose wiring`.

---

### Task 4: Deps + tsconfig + lockfile + changeset (close-out)

**Files:** each db lib `package.json` + `tsconfig.json`; root `yarn.lock`; `.changeset/blueprint-phase2c.md`.

- [ ] **Step 1: NestJS deps** — to ALL three (`libs/db-strategies/{supabase,firestore,mongodb}/package.json`): add `"@nestjs/common": "^11.1.24"` + `"@nestjs/config": "^4.0.4"` (deps); `"@nestjs/testing": "^11.0.0"` (devDep, supabase + firestore only — mongodb's Jest test needs none if shape-only). Plus: firestore add `"@icore/firebase-admin": "*"`; mongodb add `"@nestjs/mongoose": "^11.0.4"`. Grep real versions in root/sibling libs and match.

- [ ] **Step 2: Decorator flags** — add `"experimentalDecorators": true` + `"emitDecoratorMetadata": true` to each db lib's `tsconfig.json` `compilerOptions` (mirrors 2a/2b; needed for `@Module`).

- [ ] **Step 3: eslint** — if `nx lint db-<p>` flags `@nestjs/testing`/`vitest` as undeclared runtime deps, add `ignoredDependencies: ['@nestjs/testing','vitest']` to that lib's eslint config (only where needed).

- [ ] **Step 4: Lockfile (MANDATORY — CI `--immutable`)** — `yarn install`; confirm `git status --short yarn.lock` shows `M`. (Phase 2a CI failed `YN0028` from skipping this.)

- [ ] **Step 5: Verify** — `yarn nx run-many -t test -p shared,db-supabase,db-firestore,db-mongodb 2>&1 | tail -10` green; `yarn nx run-many -t lint -p db-supabase,db-firestore,db-mongodb 2>&1 | tail -6` green.

- [ ] **Step 6: Prettier + changeset + commit**

```bash
npx prettier --write libs/db-strategies
```

`.changeset/blueprint-phase2c.md`:

```md
---
'@idevconn/create-icore': minor
---

Phase 2c: each DB strategy template lib (supabase/firestore/mongodb) now ships a self-contained NestJS DynamicModule (`forRoot`) owning its construction, required-env, and dev-fake/prod-fail fallback via the shared buildStrategyWithFallback. Additive — strategy classes, contract tests, and the generator are unchanged.
```

```bash
git add libs/db-strategies .changeset/blueprint-phase2c.md yarn.lock
git commit -m "chore(create-icore): db lib deps + lockfile + phase 2c changeset"
```

---

## Self-Review

**Spec coverage:** DB slice of §3/§5 (construction → DynamicModule; mongo owns Mongoose, firestore uses firebase-admin). Libs-only; the notes app.module switch + `removeUnusedDbStrategies` deletion + the `wire-provider` consolidation (and the auth raw-dep backfill) are Phase 2c-wire.

**Placeholder scan:** Full code; the firebase→firestore + class-casing quirks called out; lockfile step explicit; firestore `db` cast preserved from the original `makeFirestoreDB`. The only "determine first" is the db-mongodb test runner (Jest vs Vitest) — explicitly instructed to inspect the lib config.

**Type consistency:** `buildStrategyWithFallback<DBStrategy>` + token/exports `'DBStrategy'` matching `NotesController`'s `@Inject('DBStrategy')`. `*_DB_REQUIRED_ENV` + `XDbModule.forRoot(envPath): DynamicModule` consistent across modules and tests; module symbols match the manifest (`SupabaseDbModule`/`FirestoreDbModule`/`MongoDbDbModule`).

**Scope:** DB axis, libs-only, additive. The notes-MS wiring + strip deletion + shared-helper extraction are Phase 2c-wire.
