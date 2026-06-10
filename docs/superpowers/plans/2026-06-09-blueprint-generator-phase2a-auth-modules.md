# Blueprint Generator — Phase 2a: Auth Provider DynamicModules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained NestJS `DynamicModule` (`forRoot(envPath)`) to each auth strategy lib (supabase/firebase/mongodb) that owns its construction, env requirements, and dev-fake/prod-fail fallback — so a future wiring PR can make the auth microservice import one chosen module instead of regex-stripping a fat app.module. **Additive only:** strategy classes, their contract tests, and the live generator are untouched.

**Architecture:** A shared `buildStrategyWithFallback` helper centralises the existing dev-fake/prod-fail logic. Each provider lib exports `XAuthModule.forRoot(envPath)` whose `'AuthStrategy'` provider calls that helper with its own `build()` and `REQUIRED_ENV`. MongoDB's module additionally imports `MongooseModule.forRootAsync` and injects the connection — its module-level infra lives in the package, not the app.

**Tech Stack:** NestJS DynamicModule + `@nestjs/testing`, Vitest/Jest.

> **⚠ PATH CORRECTION (read first).** `tools/create-icore/templates/` is a **gitignored build artifact** regenerated from the root workspace by `nx build create-icore` (via `scripts/snapshot-templates.mjs`, which copies root `libs/`+`apps/` → `templates/`). Editing there is uncommittable and gets wiped. **The real, tracked source is the root workspace.** Therefore everywhere this plan says `tools/create-icore/templates/libs/...`, edit **`libs/...`** instead (drop the prefix). These are real root Nx projects:
>
> - test with **`yarn nx test auth-supabase` / `auth-firebase` / `auth-mongodb` / `shared`** (NOT a templates-dir vitest invocation). **Task 0 is obsolete — skip it.** `auth-mongodb` uses Jest, the others Vitest; `nx test <proj>` handles both.
> - `templates/` regenerates automatically on the next `nx build create-icore`; do not touch it.
> - **Deps (verified):** add `@nestjs/mongoose@^11.0.4` to `libs/auth-strategies/mongodb/package.json`. The new module files use NestJS decorators/`ConfigService`, but the auth libs don't declare `@nestjs/common`/`@nestjs/config` — add `@nestjs/common@^11.1.24` + `@nestjs/config@^4.0.4` to whichever of the three auth libs gain a module file that imports them (all three). Match versions already present in the root `package.json`/sibling libs (e.g. `@icore/auth-client`).
> - All grounding claims in the code blocks below were verified correct against the root source (`missingEnv`/`formatEnvBanner` in `libs/shared/src/env.ts`; `FakeAuthStrategy` from `@icore/shared`; constructor shapes; `getFirebaseAdmin`/`FIREBASE_ADMIN_REQUIRED_ENV`; `HttpIdentityToolkitClient`). Index files use extension-less `export *`; test files need `.js` on relative imports (NodeNext).

---

## File Structure

All paths under `tools/create-icore/templates/`:

- Create: `libs/shared/src/strategies/provide-strategy.ts` — `buildStrategyWithFallback` helper
- Modify: `libs/shared/src/strategies/index.ts` — export the helper
- Create: `libs/auth-strategies/supabase/src/lib/supabase-auth.module.ts`
- Create: `libs/auth-strategies/firebase/src/lib/firebase-auth.module.ts`
- Create: `libs/auth-strategies/mongodb/src/lib/mongodb-auth.module.ts`
- Modify: each lib's `src/index.ts` — export the new module
- Test: `libs/shared/src/strategies/__tests__/provide-strategy.unit.test.ts`
- Test: one `*-auth.module.unit.test.ts` per auth lib

Strategy classes (`*-auth.strategy.ts`) and existing contract tests are NOT modified.

---

### Task 0: Establish how to verify template libs

**Files:** none (investigation + a documented command).

- [ ] **Step 1: Find the runnable test path for template libs**

The template libs live under `tools/create-icore/templates/libs/` and are NOT wired into the root Nx workspace. Determine how their existing unit tests run today.

Run: `cd tools/create-icore/templates && ls vitest.* nx.json package.json 2>/dev/null; grep -rl "runAuthContract" libs/auth-strategies/*/src/lib/__tests__ | head`
Then try: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/supabase 2>&1 | tail -20`

- [ ] **Step 2: Record the working command**

Whatever command runs the supabase lib's existing contract test (e.g. `cd tools/create-icore/templates && npx vitest run <path>`), record it. Every later "run test" step uses this command form. If no runner resolves from the templates dir, STOP and report NEEDS_CONTEXT with what you found — do not guess.

- [ ] **Step 3: No commit** (investigation only).

---

### Task 1: `buildStrategyWithFallback` shared helper

**Files:**

- Create: `tools/create-icore/templates/libs/shared/src/strategies/provide-strategy.ts`
- Modify: `tools/create-icore/templates/libs/shared/src/strategies/index.ts`
- Test: `tools/create-icore/templates/libs/shared/src/strategies/__tests__/provide-strategy.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildStrategyWithFallback } from '../provide-strategy.js';

const cfgFrom = (env: Record<string, string | undefined>) => ({
  get: (k: string) => env[k],
});

afterEach(() => {
  delete process.env.NODE_ENV;
  vi.restoreAllMocks();
});

describe('buildStrategyWithFallback', () => {
  it('returns the built strategy when all required env is present', () => {
    const result = buildStrategyWithFallback({
      service: 'auth MS',
      provider: 'supabase',
      requiredEnv: ['A', 'B'],
      cfg: cfgFrom({ A: '1', B: '2' }),
      envPath: '.env',
      build: () => 'REAL',
      fake: () => 'FAKE',
    });
    expect(result).toBe('REAL');
  });

  it('returns the fake (dev) when required env is missing', () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = buildStrategyWithFallback({
      service: 'auth MS',
      provider: 'supabase',
      requiredEnv: ['A', 'B'],
      cfg: cfgFrom({ A: '1' }),
      envPath: '.env',
      build: () => 'REAL',
      fake: () => 'FAKE',
    });
    expect(result).toBe('FAKE');
  });

  it('throws (prod) when required env is missing', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      buildStrategyWithFallback({
        service: 'auth MS',
        provider: 'supabase',
        requiredEnv: ['A', 'B'],
        cfg: cfgFrom({}),
        envPath: '.env',
        build: () => 'REAL',
        fake: () => 'FAKE',
      }),
    ).toThrow();
  });

  it('falls back when build() throws despite present env', () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = buildStrategyWithFallback({
      service: 'auth MS',
      provider: 'supabase',
      requiredEnv: ['A'],
      cfg: cfgFrom({ A: '1' }),
      envPath: '.env',
      build: () => {
        throw new Error('bad url');
      },
      fake: () => 'FAKE',
    });
    expect(result).toBe('FAKE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/create-icore/templates && npx vitest run libs/shared/src/strategies/__tests__/provide-strategy.unit.test.ts`
Expected: FAIL — `buildStrategyWithFallback` not found.

- [ ] **Step 3: Write the helper**

```ts
import { missingEnv, formatEnvBanner } from '../env.js';

export interface StrategyConfigReader {
  get(key: string): string | undefined;
}

export interface BuildStrategyOpts<T> {
  service: string;
  provider: string;
  requiredEnv: string[];
  cfg: StrategyConfigReader;
  envPath: string;
  build: () => T;
  fake: () => T;
}

/**
 * Build a concrete strategy, or fall back to the in-memory fake. Centralises the
 * dev-warns-and-fakes / prod-fails-fast behavior that used to live inline in each
 * microservice app.module useFactory.
 */
export function buildStrategyWithFallback<T>(opts: BuildStrategyOpts<T>): T {
  const missing = missingEnv((k) => opts.cfg.get(k), opts.requiredEnv);

  const fallback = (reason?: string): T => {
    const banner = formatEnvBanner({
      service: opts.service,
      provider: opts.provider,
      missing,
      envPath: opts.envPath,
      reason,
    });
    if (process.env.NODE_ENV === 'production') throw new Error(banner);
    console.warn(banner);
    return opts.fake();
  };

  if (missing.length > 0) return fallback();
  try {
    return opts.build();
  } catch (err) {
    return fallback(err instanceof Error ? err.message : String(err));
  }
}
```

- [ ] **Step 4: Export it**

Append to `tools/create-icore/templates/libs/shared/src/strategies/index.ts`:

```ts
export * from './provide-strategy';
```

(Match the existing export style in that file — if it lists explicit files without extensions, follow that; if the dir already uses `export *`, this line fits.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tools/create-icore/templates && npx vitest run libs/shared/src/strategies/__tests__/provide-strategy.unit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/templates/libs/shared/src/strategies/provide-strategy.ts \
        tools/create-icore/templates/libs/shared/src/strategies/index.ts \
        tools/create-icore/templates/libs/shared/src/strategies/__tests__/provide-strategy.unit.test.ts
git commit -m "feat(templates/shared): buildStrategyWithFallback helper"
```

---

### Task 2: `SupabaseAuthModule`

**Files:**

- Create: `tools/create-icore/templates/libs/auth-strategies/supabase/src/lib/supabase-auth.module.ts`
- Modify: `tools/create-icore/templates/libs/auth-strategies/supabase/src/index.ts`
- Test: `tools/create-icore/templates/libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.module.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthModule, SUPABASE_AUTH_REQUIRED_ENV } from '../supabase-auth.module.js';
import { SupabaseAuthStrategy } from '../supabase-auth.strategy.js';

function moduleWith(env: Record<string, string | undefined>) {
  return Test.createTestingModule({ imports: [SupabaseAuthModule.forRoot('.env')] })
    .overrideProvider(ConfigService)
    .useValue({ get: (k: string) => env[k], getOrThrow: (k: string) => env[k] })
    .compile();
}

describe('SupabaseAuthModule', () => {
  it('exposes its required env', () => {
    expect(SUPABASE_AUTH_REQUIRED_ENV).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });

  it('provides a real SupabaseAuthStrategy under the AuthStrategy token when env is present', async () => {
    const ref = await moduleWith({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
    });
    expect(ref.get('AuthStrategy')).toBeInstanceOf(SupabaseAuthStrategy);
  });
});
```

> If `Test.createTestingModule(...).overrideProvider(ConfigService)` cannot override a provider that the module itself does not declare, instead provide ConfigService explicitly: build the module under test as `{ imports: [SupabaseAuthModule.forRoot('.env')], providers: [{ provide: ConfigService, useValue: {...} }] }` via a tiny wrapper module, or pass a stub ConfigService through `forRoot`. Use whichever the template's other Nest tests already use; if none exist, prefer the explicit-provider form.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.module.unit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { buildStrategyWithFallback, FakeAuthStrategy } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { SupabaseAuthStrategy } from './supabase-auth.strategy';

export const SUPABASE_AUTH_REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

@Module({})
export class SupabaseAuthModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: SupabaseAuthModule,
      providers: [
        {
          provide: 'AuthStrategy',
          useFactory: (cfg: ConfigService): AuthStrategy =>
            buildStrategyWithFallback<AuthStrategy>({
              service: 'auth MS',
              provider: 'supabase',
              requiredEnv: SUPABASE_AUTH_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new SupabaseAuthStrategy({
                  client: createClient(
                    cfg.getOrThrow<string>('SUPABASE_URL'),
                    cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
                    { auth: { autoRefreshToken: false, persistSession: false } },
                  ),
                }),
              fake: () => new FakeAuthStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['AuthStrategy'],
    };
  }
}
```

> Verify `FakeAuthStrategy` and `buildStrategyWithFallback` are both exported from `@icore/shared` (they are: FakeAuthStrategy already is — the old app.module imports it from there — and the helper was exported in Task 1). If the lib cannot import `@icore/shared` because it lacks the dep, add `"@icore/shared": "*"` to its `package.json` dependencies (supabase lib already declares it).

- [ ] **Step 4: Export the module**

Append to `tools/create-icore/templates/libs/auth-strategies/supabase/src/index.ts`:

```ts
export * from './lib/supabase-auth.module';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.module.unit.test.ts`
Expected: PASS (2 tests). Also re-run the existing contract test to prove it's untouched: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/supabase` → still green.

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/templates/libs/auth-strategies/supabase/src/lib/supabase-auth.module.ts \
        tools/create-icore/templates/libs/auth-strategies/supabase/src/index.ts \
        tools/create-icore/templates/libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.module.unit.test.ts
git commit -m "feat(templates/auth-supabase): SupabaseAuthModule DynamicModule"
```

---

### Task 3: `FirebaseAuthModule`

**Files:**

- Create: `tools/create-icore/templates/libs/auth-strategies/firebase/src/lib/firebase-auth.module.ts`
- Modify: `tools/create-icore/templates/libs/auth-strategies/firebase/src/index.ts`
- Test: `tools/create-icore/templates/libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.module.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FirebaseAuthModule, FIREBASE_AUTH_REQUIRED_ENV } from '../firebase-auth.module.js';

describe('FirebaseAuthModule', () => {
  it('requires the firebase-admin env plus the web api key', () => {
    expect(FIREBASE_AUTH_REQUIRED_ENV).toContain('FIREBASE_WEB_API_KEY');
    expect(FIREBASE_AUTH_REQUIRED_ENV).toContain('FB_ADMIN_PROJECT_ID');
  });

  it('falls back to the fake (dev) when env is missing, without touching firebase-admin', async () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ref = await Test.createTestingModule({
      imports: [FirebaseAuthModule.forRoot('.env')],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: () => undefined,
        getOrThrow: () => {
          throw new Error('missing');
        },
      })
      .compile();
    // Fake strategy still satisfies the AuthStrategy contract (has verifyToken).
    expect(typeof (ref.get('AuthStrategy') as { verifyToken: unknown }).verifyToken).toBe(
      'function',
    );
    delete process.env.NODE_ENV;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.module.unit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';
import { buildStrategyWithFallback, FakeAuthStrategy } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { FirebaseAuthStrategy } from './firebase-auth.strategy';
import { HttpIdentityToolkitClient } from './identity-toolkit.client';

export const FIREBASE_AUTH_REQUIRED_ENV = [...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_WEB_API_KEY'];

@Module({})
export class FirebaseAuthModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: FirebaseAuthModule,
      providers: [
        {
          provide: 'AuthStrategy',
          useFactory: (cfg: ConfigService): AuthStrategy =>
            buildStrategyWithFallback<AuthStrategy>({
              service: 'auth MS',
              provider: 'firebase',
              requiredEnv: FIREBASE_AUTH_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                const app = getFirebaseAdmin(cfg);
                const identityToolkit = new HttpIdentityToolkitClient(
                  cfg.getOrThrow<string>('FIREBASE_WEB_API_KEY'),
                );
                return new FirebaseAuthStrategy({ identityToolkit, adminAuth: app.auth() });
              },
              fake: () => new FakeAuthStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['AuthStrategy'],
    };
  }
}
```

> Confirm the import names `HttpIdentityToolkitClient` and `getFirebaseAdmin`/`FIREBASE_ADMIN_REQUIRED_ENV` match the lib's actual exports (grounding confirms: `identity-toolkit.client` exports `HttpIdentityToolkitClient`; `@icore/firebase-admin` exports both `getFirebaseAdmin` and `FIREBASE_ADMIN_REQUIRED_ENV`). The firebase lib must declare `@icore/firebase-admin` as a dep — if missing, add `"@icore/firebase-admin": "*"`.

- [ ] **Step 4: Export the module**

Append to `tools/create-icore/templates/libs/auth-strategies/firebase/src/index.ts`:

```ts
export * from './lib/firebase-auth.module';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.module.unit.test.ts`
Expected: PASS (2 tests). Re-run existing firebase contract test: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/firebase` → still green.

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/templates/libs/auth-strategies/firebase/src/lib/firebase-auth.module.ts \
        tools/create-icore/templates/libs/auth-strategies/firebase/src/index.ts \
        tools/create-icore/templates/libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.module.unit.test.ts
git commit -m "feat(templates/auth-firebase): FirebaseAuthModule DynamicModule"
```

---

### Task 4: `MongoDbAuthModule` (owns its Mongoose wiring)

**Files:**

- Create: `tools/create-icore/templates/libs/auth-strategies/mongodb/src/lib/mongodb-auth.module.ts`
- Modify: `tools/create-icore/templates/libs/auth-strategies/mongodb/src/index.ts`
- Test: `tools/create-icore/templates/libs/auth-strategies/mongodb/src/lib/__tests__/mongodb-auth.module.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { MongoDbAuthModule, MONGODB_AUTH_REQUIRED_ENV } from '../mongodb-auth.module.js';

describe('MongoDbAuthModule', () => {
  it('requires the mongo uri and jwt secret', () => {
    expect(MONGODB_AUTH_REQUIRED_ENV).toEqual(['MONGODB_URI', 'JWT_SECRET']);
  });

  it('forRoot returns a DynamicModule that imports Mongoose and exports the AuthStrategy token', () => {
    const dm = MongoDbAuthModule.forRoot('.env');
    expect(dm.module).toBe(MongoDbAuthModule);
    expect(dm.exports).toContain('AuthStrategy');
    // Mongoose connection wiring is the module's own concern.
    expect(Array.isArray(dm.imports)).toBe(true);
    expect((dm.imports ?? []).length).toBeGreaterThan(0);
  });
});
```

> A full boot test would need a live Mongo (the existing strategy test uses `mongodb-memory-server`). Phase 2a only asserts the module SHAPE (token exported, Mongoose imported, env constant). The real connection path is exercised by the existing `mongodb-auth.strategy.unit.test.ts` (untouched) and by the Phase-9 smoke matrix.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/mongodb/src/lib/__tests__/mongodb-auth.module.unit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { buildStrategyWithFallback, FakeAuthStrategy } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { MongoDbAuthStrategy } from './mongodb-auth.strategy';

export const MONGODB_AUTH_REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];

@Module({})
export class MongoDbAuthModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: MongoDbAuthModule,
      imports: [
        MongooseModule.forRootAsync({
          useFactory: (cfg: ConfigService) => ({ uri: cfg.get<string>('MONGODB_URI') }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        {
          provide: 'AuthStrategy',
          useFactory: (cfg: ConfigService, connection: Connection): AuthStrategy =>
            buildStrategyWithFallback<AuthStrategy>({
              service: 'auth MS',
              provider: 'mongodb',
              requiredEnv: MONGODB_AUTH_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new MongoDbAuthStrategy({
                  connection,
                  jwtSecret: cfg.getOrThrow<string>('JWT_SECRET'),
                }),
              fake: () => new FakeAuthStrategy(),
            }),
          inject: [ConfigService, getConnectionToken()],
        },
      ],
      exports: ['AuthStrategy'],
    };
  }
}
```

> The mongodb lib must declare `@nestjs/mongoose`, `mongoose`, and `@icore/shared` deps. It already declares `mongoose` and `@icore/shared`; if `@nestjs/mongoose` is absent from its `package.json`, add `"@nestjs/mongoose": "^11.0.0"` (match the version the auth microservice's package.json uses — grep `tools/create-icore/templates/apps/microservices/auth/package.json` for the exact range and use that).

- [ ] **Step 4: Export the module**

Append to `tools/create-icore/templates/libs/auth-strategies/mongodb/src/index.ts`:

```ts
export * from './lib/mongodb-auth.module';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/mongodb/src/lib/__tests__/mongodb-auth.module.unit.test.ts`
Expected: PASS (2 tests). Re-run existing mongodb strategy test: `cd tools/create-icore/templates && npx vitest run libs/auth-strategies/mongodb` → still green.

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/templates/libs/auth-strategies/mongodb/src/lib/mongodb-auth.module.ts \
        tools/create-icore/templates/libs/auth-strategies/mongodb/src/index.ts \
        tools/create-icore/templates/libs/auth-strategies/mongodb/src/lib/__tests__/mongodb-auth.module.unit.test.ts \
        tools/create-icore/templates/libs/auth-strategies/mongodb/package.json
git commit -m "feat(templates/auth-mongodb): MongoDbAuthModule with own Mongoose wiring"
```

---

### Task 5: Close-out (typecheck all three modules + changeset)

**Files:**

- Create: `.changeset/blueprint-phase2a.md`

- [ ] **Step 1: Typecheck the templates compile**

Templates aren't part of the root build, so typecheck them directly against their tsconfig:
Run: `cd tools/create-icore/templates && npx tsc -p tsconfig.base.json --noEmit 2>&1 | grep -E "auth-strategies|provide-strategy|TS[0-9]" | head -20 || echo "templates typecheck clean for touched files"`
Expected: no errors referencing the new module files. If the templates have no root tsconfig that resolves `@icore/*`, fall back to the per-lib check the existing libs use (inspect a lib `project.json`/`tsconfig.lib.json` and run the matching `tsc`). Record the command used.

- [ ] **Step 2: Run every touched lib's full test suite**

Run: `cd tools/create-icore/templates && npx vitest run libs/shared libs/auth-strategies 2>&1 | tail -15`
Expected: all green — new module tests + untouched contract/strategy tests.

- [ ] **Step 3: Prettier**

Run: `npx prettier --write tools/create-icore/templates/libs/shared/src/strategies tools/create-icore/templates/libs/auth-strategies`
Expected: reformat/no error.

- [ ] **Step 4: Changeset**

```md
---
'@idevconn/create-icore': minor
---

Phase 2a: each auth strategy template lib (supabase/firebase/mongodb) now ships a self-contained NestJS DynamicModule (`forRoot`) that owns its construction, required-env, and dev-fake/prod-fail fallback via the new shared `buildStrategyWithFallback`. Additive — strategy classes, contract tests, and the generator are unchanged.
```

- [ ] **Step 5: Commit**

```bash
git add .changeset/blueprint-phase2a.md
git commit -m "chore(create-icore): blueprint phase 2a changeset"
```

---

## Self-Review

**Spec coverage:** Implements the auth slice of design §3 "notable refactor: construction moves out of app.module into the package as a DynamicModule" + §5 factory-location detail (provider owns infra; mongo owns Mongoose). Phase 2a is libs-only; the static app.module + generator switch + strip deletion are the follow-up wiring PR (Phase 2a-wire), explicitly out of scope here.

**Placeholder scan:** Version strings (`@nestjs/mongoose`) and the test-module override form carry explicit "grep the real value / use whichever the template uses" instructions rather than vague guesses. Task 0 de-risks the unknown test runner before any code. No TBD/TODO.

**Type consistency:** `buildStrategyWithFallback<T>(opts: BuildStrategyOpts<T>): T` (Task 1) is called identically in Tasks 2–4 with `T = AuthStrategy`. `*_AUTH_REQUIRED_ENV` constants and `XAuthModule.forRoot(envPath: string): DynamicModule` signatures are consistent across the three modules and their tests. The `'AuthStrategy'` string token matches the existing app.module token so the future wiring PR is drop-in.

**Scope:** Auth axis, libs-only, additive. Storage/db axes and the generator wiring are separate plans.
