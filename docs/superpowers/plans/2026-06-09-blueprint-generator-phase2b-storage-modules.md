# Blueprint Generator — Phase 2b: Storage Provider DynamicModules

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Add a self-contained NestJS `DynamicModule` (`forRoot(envPath)`) to each storage strategy lib (supabase/firebase/cloudinary/mongodb), mirroring Phase 2a (auth). **Additive, libs-only:** strategy classes, contract tests, the upload `app.module.ts`, and the generator are untouched. A later wiring PR (Phase 2b-wire) will make the upload MS import one chosen module.

**Architecture:** Each storage lib exports `XStorageModule.forRoot(envPath)` providing+exporting the `'StorageStrategy'` token via the existing shared `buildStrategyWithFallback` helper, with provider-specific `build()` + a `*_STORAGE_REQUIRED_ENV` constant. MongoDB owns its `MongooseModule.forRootAsync` + connection injection; Firebase uses `getFirebaseAdmin`; Cloudinary builds its API wrapper inside `build()`.

**Tech Stack:** NestJS DynamicModule + `@nestjs/testing`, Vitest/Jest. Edit the tracked root `libs/` (NOT `tools/create-icore/templates/`, a gitignored snapshot). Test with `yarn nx test storage-supabase|storage-firebase|storage-cloudinary|storage-mongodb|shared`.

> **Token:** `'StorageStrategy'`. **Service label:** `'upload MS'`. **Fake:** `FakeStorageStrategy` (exported from `@icore/shared`). The manifest already declares the `nestModule` symbols (`SupabaseStorageModule`/`FirebaseStorageModule`/`CloudinaryStorageModule`/`MongoDbStorageModule`) — match those names exactly.

---

## File Structure

All under `libs/storage-strategies/<provider>/`:

- Create: `<provider>/src/lib/<provider>-storage.module.ts` (4 modules)
- Modify: `<provider>/src/index.ts` — append `export * from './lib/<provider>-storage.module';`
- Test: `<provider>/src/lib/__tests__/<provider>-storage.module.unit.test.ts`
- Modify: each `<provider>/package.json` — add NestJS deps (Task 5)
- Modify: each `<provider>/tsconfig.json` — `experimentalDecorators` + `emitDecoratorMetadata` (NestJS decorators need them; mirrors Phase 2a)
- Create: `.changeset/blueprint-phase2b.md`

Strategy classes + contract tests are NOT modified.

> **Per-provider env constants (verified):**
>
> - supabase: `['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET']`
> - firebase: `[...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_STORAGE_BUCKET']`
> - cloudinary: `['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']`
> - mongodb: `['MONGODB_URI']`

---

### Task 1: `SupabaseStorageModule`

**Files:** Create `libs/storage-strategies/supabase/src/lib/supabase-storage.module.ts` + test; modify `src/index.ts`.

- [ ] **Step 1: Failing test** — `libs/storage-strategies/supabase/src/lib/__tests__/supabase-storage.module.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  SupabaseStorageModule,
  SUPABASE_STORAGE_REQUIRED_ENV,
} from '../supabase-storage.module.js';
import { SupabaseStorageStrategy } from '../supabase-storage.strategy.js';

@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: makeCfg() }],
  exports: [ConfigService],
})
class StubConfigModule {}

let ENV: Record<string, string | undefined> = {};
function makeCfg() {
  return {
    get: (k: string) => ENV[k],
    getOrThrow: (k: string) => ENV[k],
  } as unknown as ConfigService;
}

describe('SupabaseStorageModule', () => {
  it('declares its required env', () => {
    expect(SUPABASE_STORAGE_REQUIRED_ENV).toEqual([
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_STORAGE_BUCKET',
    ]);
  });

  it('provides a real SupabaseStorageStrategy under StorageStrategy when env present', async () => {
    ENV = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
      SUPABASE_STORAGE_BUCKET: 'uploads',
    };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, SupabaseStorageModule.forRoot('.env')],
    }).compile();
    expect(ref.get('StorageStrategy')).toBeInstanceOf(SupabaseStorageStrategy);
  });
});
```

> Use the `@Global() StubConfigModule` form (proven in Phase 2a) so the DynamicModule's `ConfigService` injection resolves.

- [ ] **Step 2: Run → fail**

Run: `yarn nx test storage-supabase -- supabase-storage.module`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `supabase-storage.module.ts`

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { SupabaseStorageStrategy } from './supabase-storage.strategy';

export const SUPABASE_STORAGE_REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
];

@Module({})
export class SupabaseStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: SupabaseStorageModule,
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'supabase',
              requiredEnv: SUPABASE_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new SupabaseStorageStrategy({
                  client: createClient(
                    cfg.getOrThrow<string>('SUPABASE_URL'),
                    cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
                    { auth: { autoRefreshToken: false, persistSession: false } },
                  ),
                  bucket: cfg.getOrThrow<string>('SUPABASE_STORAGE_BUCKET'),
                }),
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
```

- [ ] **Step 4: Export** — append to `libs/storage-strategies/supabase/src/index.ts`:

```ts
export * from './lib/supabase-storage.module';
```

- [ ] **Step 5: Run → pass** (`yarn nx test storage-supabase -- supabase-storage.module`; also `yarn nx test storage-supabase` to confirm the contract test still passes). Expected: green.

- [ ] **Step 6: Commit**

```bash
git add libs/storage-strategies/supabase/src/lib/supabase-storage.module.ts \
        libs/storage-strategies/supabase/src/index.ts \
        libs/storage-strategies/supabase/src/lib/__tests__/supabase-storage.module.unit.test.ts
git commit -m "feat(storage-supabase): SupabaseStorageModule DynamicModule"
```

---

### Task 2: `CloudinaryStorageModule`

**Files:** Create `libs/storage-strategies/cloudinary/src/lib/cloudinary-storage.module.ts` + test; modify `src/index.ts`.

- [ ] **Step 1: Failing test** (mirror Task 1's structure; env `['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET']`, assert `instanceof CloudinaryStorageStrategy` with those three env vars set to dummy strings). File: `.../cloudinary/src/lib/__tests__/cloudinary-storage.module.unit.test.ts`. Import `CloudinaryStorageModule, CLOUDINARY_STORAGE_REQUIRED_ENV` + `CloudinaryStorageStrategy` from `../cloudinary-storage.strategy.js`.

```ts
import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  CloudinaryStorageModule,
  CLOUDINARY_STORAGE_REQUIRED_ENV,
} from '../cloudinary-storage.module.js';
import { CloudinaryStorageStrategy } from '../cloudinary-storage.strategy.js';

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

describe('CloudinaryStorageModule', () => {
  it('declares its required env', () => {
    expect(CLOUDINARY_STORAGE_REQUIRED_ENV).toEqual([
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]);
  });

  it('provides a real CloudinaryStorageStrategy when env present', async () => {
    ENV = { CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, CloudinaryStorageModule.forRoot('.env')],
    }).compile();
    expect(ref.get('StorageStrategy')).toBeInstanceOf(CloudinaryStorageStrategy);
  });
});
```

- [ ] **Step 2: Run → fail** (`yarn nx test storage-cloudinary -- cloudinary-storage.module`).

- [ ] **Step 3: Implement** — `cloudinary-storage.module.ts`. Move the `makeCloudinaryStorage` body (the `cloudinary.config` + the `CloudinaryApiLike` wrapper) into `build()` verbatim:

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { CloudinaryStorageStrategy, type CloudinaryApiLike } from './cloudinary-storage.strategy';

export const CLOUDINARY_STORAGE_REQUIRED_ENV = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

@Module({})
export class CloudinaryStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: CloudinaryStorageModule,
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'cloudinary',
              requiredEnv: CLOUDINARY_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                cloudinary.config({
                  cloud_name: cfg.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
                  api_key: cfg.getOrThrow<string>('CLOUDINARY_API_KEY'),
                  api_secret: cfg.getOrThrow<string>('CLOUDINARY_API_SECRET'),
                  secure: true,
                });
                const api: CloudinaryApiLike = {
                  async upload(buffer, opts) {
                    return new Promise((resolve, reject) => {
                      const stream = cloudinary.uploader.upload_stream(
                        { public_id: opts.public_id, resource_type: opts.resource_type ?? 'raw' },
                        (error, result) => {
                          if (error || !result) reject(error ?? new Error('upload_failed'));
                          else
                            resolve({ public_id: result.public_id, secure_url: result.secure_url });
                        },
                      );
                      stream.end(buffer);
                    });
                  },
                  async destroy(publicId) {
                    await cloudinary.uploader.destroy(publicId);
                  },
                  privateDownloadUrl(publicId, format, opts) {
                    return cloudinary.utils.private_download_url(
                      publicId,
                      format ?? '',
                      opts ?? {},
                    );
                  },
                  async resources(opts) {
                    const res = await cloudinary.api.resources({
                      prefix: opts.prefix,
                      type: opts.type ?? 'upload',
                    });
                    return {
                      resources: (res.resources ?? []).map((r: { public_id: string }) => ({
                        public_id: r.public_id,
                      })),
                    };
                  },
                };
                return new CloudinaryStorageStrategy({
                  api,
                  bucket: cfg.get<string>('CLOUDINARY_BUCKET_TAG') ?? 'cloudinary',
                });
              },
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
```

> Verify `CloudinaryApiLike` is exported from `cloudinary-storage.strategy.ts` (grounding shows it is). If it is not a named export, define the `api` object with an inline type instead — do NOT change the strategy file.

- [ ] **Step 4: Export** + **Step 5: Run → pass** (module test + `yarn nx test storage-cloudinary` contract still green) + **Step 6: Commit** `feat(storage-cloudinary): CloudinaryStorageModule DynamicModule`.

---

### Task 3: `FirebaseStorageModule`

**Files:** Create `libs/storage-strategies/firebase/src/lib/firebase-storage.module.ts` + test; modify `src/index.ts`.

- [ ] **Step 1: Failing test** — assert `FIREBASE_STORAGE_REQUIRED_ENV` contains `'FIREBASE_STORAGE_BUCKET'` + `'FB_ADMIN_PROJECT_ID'`, and that with all env missing (dev) it falls back to a fake (a `StorageStrategy` with an `upload` method) WITHOUT touching firebase-admin. Mirror Phase 2a's firebase fallback test (set `process.env.NODE_ENV='development'`, stub ConfigService returning undefined, `vi.spyOn(console,'warn')`).

```ts
import { describe, it, expect, vi } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  FirebaseStorageModule,
  FIREBASE_STORAGE_REQUIRED_ENV,
} from '../firebase-storage.module.js';

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

describe('FirebaseStorageModule', () => {
  it('requires firebase-admin env + the storage bucket', () => {
    expect(FIREBASE_STORAGE_REQUIRED_ENV).toContain('FIREBASE_STORAGE_BUCKET');
    expect(FIREBASE_STORAGE_REQUIRED_ENV).toContain('FB_ADMIN_PROJECT_ID');
  });

  it('falls back to the fake (dev) when env is missing, without touching firebase-admin', async () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, FirebaseStorageModule.forRoot('.env')],
    }).compile();
    expect(typeof (ref.get('StorageStrategy') as { upload: unknown }).upload).toBe('function');
    delete process.env.NODE_ENV;
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — `firebase-storage.module.ts`:

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import {
  FirebaseStorageStrategy,
  type FirebaseStorageBucketLike,
} from './firebase-storage.strategy';

export const FIREBASE_STORAGE_REQUIRED_ENV = [
  ...FIREBASE_ADMIN_REQUIRED_ENV,
  'FIREBASE_STORAGE_BUCKET',
];

@Module({})
export class FirebaseStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: FirebaseStorageModule,
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'firebase',
              requiredEnv: FIREBASE_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                const bucketName = cfg.getOrThrow<string>('FIREBASE_STORAGE_BUCKET');
                const app = getFirebaseAdmin(cfg);
                return new FirebaseStorageStrategy({
                  bucket: app.storage().bucket(bucketName) as unknown as FirebaseStorageBucketLike,
                });
              },
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
```

- [ ] **Step 4: Export** + **Step 5: Run → pass** (module test + `yarn nx test storage-firebase`) + **Step 6: Commit** `feat(storage-firebase): FirebaseStorageModule DynamicModule`.

---

### Task 4: `MongoDbStorageModule` (owns Mongoose wiring)

**Files:** Create `libs/storage-strategies/mongodb/src/lib/mongodb-storage.module.ts` + test; modify `src/index.ts`.

- [ ] **Step 1: Failing test** — shape assertions (like Phase 2a mongodb): `MONGODB_STORAGE_REQUIRED_ENV === ['MONGODB_URI']`; `forRoot('.env')` returns a DynamicModule whose `.module` is `MongoDbStorageModule`, `.exports` contains `'StorageStrategy'`, and `.imports` is a non-empty array (Mongoose). Do NOT boot it (MongooseModule auto-connects). File `.../mongodb/src/lib/__tests__/mongodb-storage.module.unit.test.ts`.

```ts
import { describe, it, expect } from 'vitest';
import { MongoDbStorageModule, MONGODB_STORAGE_REQUIRED_ENV } from '../mongodb-storage.module.js';

describe('MongoDbStorageModule', () => {
  it('requires the mongo uri', () => {
    expect(MONGODB_STORAGE_REQUIRED_ENV).toEqual(['MONGODB_URI']);
  });
  it('forRoot returns a DynamicModule importing Mongoose and exporting StorageStrategy', () => {
    const dm = MongoDbStorageModule.forRoot('.env');
    expect(dm.module).toBe(MongoDbStorageModule);
    expect(dm.exports).toContain('StorageStrategy');
    expect(Array.isArray(dm.imports)).toBe(true);
    expect((dm.imports ?? []).length).toBeGreaterThan(0);
  });
});
```

> NOTE: `storage-mongodb` uses **Jest** (like `auth-mongodb`). Its test file must NOT use `.js` import extensions or `vitest` imports — use bare `describe/it/expect` globals (Jest) and import from `'../mongodb-storage.module'` WITHOUT `.js`. Match the existing `mongodb-storage.strategy.unit.test.ts` conventions in that lib.

- [ ] **Step 2: Run → fail** (`yarn nx test storage-mongodb -- mongodb-storage.module`).

- [ ] **Step 3: Implement** — `mongodb-storage.module.ts`:

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { MongoDbStorageStrategy } from './mongodb-storage.strategy';

export const MONGODB_STORAGE_REQUIRED_ENV = ['MONGODB_URI'];

@Module({})
export class MongoDbStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: MongoDbStorageModule,
      imports: [
        MongooseModule.forRootAsync({
          useFactory: (cfg: ConfigService) => ({ uri: cfg.get<string>('MONGODB_URI') }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService, connection: Connection): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'mongodb',
              requiredEnv: MONGODB_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => new MongoDbStorageStrategy({ connection }),
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService, getConnectionToken()],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
```

- [ ] **Step 4: Export** + **Step 5: Run → pass** + **Step 6: Commit** `feat(storage-mongodb): MongoDbStorageModule with own Mongoose wiring`.

---

### Task 5: Deps + tsconfig + lockfile + changeset (close-out)

**Files:** each storage lib `package.json` + `tsconfig.json`; root `yarn.lock`; `.changeset/blueprint-phase2b.md`.

- [ ] **Step 1: Add NestJS deps to each storage lib `package.json`**

For ALL four (`libs/storage-strategies/{supabase,firebase,cloudinary,mongodb}/package.json`): add to `dependencies` `"@nestjs/common": "^11.1.24"`, `"@nestjs/config": "^4.0.4"`; add to `devDependencies` `"@nestjs/testing": "^11.0.0"` (skip `@nestjs/testing` for mongodb — its Jest test imports no Nest testing util). Additionally:

- firebase: add `"@icore/firebase-admin": "*"` to dependencies.
- mongodb: add `"@nestjs/mongoose": "^11.0.4"` to dependencies.

Grep the real versions in root `package.json` / a sibling auth lib first and match them exactly.

- [ ] **Step 2: Enable decorators in each storage lib `tsconfig.json`**

Add `"experimentalDecorators": true` + `"emitDecoratorMetadata": true` to `compilerOptions` of each of the four `libs/storage-strategies/<provider>/tsconfig.json` (mirrors Phase 2a; needed for `@Module`). If a lib has only `tsconfig.lib.json`/`tsconfig.spec.json`, add to the one the build/test uses (match how `libs/auth-strategies/supabase` was configured in Phase 2a).

- [ ] **Step 3: eslint ignoredDependencies (if dependency-checks flags test-only deps)**

If `yarn nx lint storage-<p>` errors that `@nestjs/testing`/`vitest` should be in dependencies, add `ignoredDependencies: ['@nestjs/testing', 'vitest']` to that lib's eslint config (mirrors Phase 2a supabase/firebase). Only where needed.

- [ ] **Step 4: Regenerate the lockfile (MANDATORY — CI is `--immutable`)**

Run: `yarn install`
Run: `git status --short yarn.lock` → expect `M yarn.lock`. (Phase 2a CI failed `YN0028` because this was skipped — do NOT skip it.)

- [ ] **Step 5: Full verification**

Run: `yarn nx run-many -t test -p shared,storage-supabase,storage-firebase,storage-cloudinary,storage-mongodb 2>&1 | tail -10` → all green (new module tests + untouched contract/strategy tests).
Run: `yarn nx run-many -t lint -p storage-supabase,storage-firebase,storage-cloudinary,storage-mongodb 2>&1 | tail -6` → green.

- [ ] **Step 6: Prettier + changeset + commit**

```bash
npx prettier --write libs/storage-strategies
```

`.changeset/blueprint-phase2b.md`:

```md
---
'@idevconn/create-icore': minor
---

Phase 2b: each storage strategy template lib (supabase/firebase/cloudinary/mongodb) now ships a self-contained NestJS DynamicModule (`forRoot`) owning its construction, required-env, and dev-fake/prod-fail fallback via the shared buildStrategyWithFallback. Additive — strategy classes, contract tests, and the generator are unchanged.
```

```bash
git add libs/storage-strategies .changeset/blueprint-phase2b.md yarn.lock
git commit -m "chore(create-icore): storage lib deps + lockfile + phase 2b changeset"
```

---

## Self-Review

**Spec coverage:** Storage slice of §3 "construction moves into the package as a DynamicModule" + §5 factory-location (mongo owns Mongoose, firebase uses firebase-admin, cloudinary builds its API inside `build()`). Libs-only; the upload app.module switch + strip deletion are Phase 2b-wire (out of scope here).

**Placeholder scan:** Dep versions carry "grep + match real" instructions; the lockfile step is explicit (the Phase 2a miss). Cloudinary's bulky `build()` body is quoted verbatim from the current `makeCloudinaryStorage`. No TBD.

**Type consistency:** `buildStrategyWithFallback<StorageStrategy>` used identically in all four modules with `provide/exports: 'StorageStrategy'` matching `StorageController`'s `@Inject('StorageStrategy')`. `*_STORAGE_REQUIRED_ENV` names + `XStorageModule.forRoot(envPath): DynamicModule` signatures consistent across modules and tests, and the module symbols match the manifest's declared `nestModule.symbol`.

**Scope:** Storage axis, libs-only, additive. db axis + the upload wiring are separate plans.
