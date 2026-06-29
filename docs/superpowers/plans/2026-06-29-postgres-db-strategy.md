# PostgreSQL DB Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@icore/db-postgres` — a fourth DB strategy using `postgres.js` with JSONB storage — and wire it into `create-icore` CLI as `--db=postgres`.

**Architecture:** Standalone PostgreSQL via `postgres.js` (no ORM). Schema matches the existing Supabase strategy: each collection → one table with `id TEXT PRIMARY KEY, data JSONB NOT NULL` + GIN index auto-created on first write. CLI changes add `postgres` as a selectable `DbProvider` option.

**Tech Stack:** `postgres` (postgres.js ^3), NestJS DynamicModule, Vitest, `@icore/shared` contract harness

## Global Constraints

- Branch: `feature/postgres-db-strategy` cut from `dev`
- Package manager: `yarn` (workspace uses Yarn 4, node-modules linker)
- NestJS tsconfig: `module: node16`, `moduleResolution: node16`
- Token used for DBStrategy injection: string `'DBStrategy'` (not a symbol constant)
- `buildStrategyWithFallback` and `FakeDBStrategy` imported from `@icore/shared`
- `runDBContract` imported from `@icore/shared/testing` (test-only entry point)
- Blueprint source of truth: `tools/create-icore/templates/libs/db-strategies/postgres/` — kept in sync with `libs/db-strategies/postgres/` manually
- Post-coding routine: `prettier → lint → build → docs` before every commit
- Changeset required: `.changeset/<slug>.md` with `"@idevconn/create-icore": patch`
- PR base: always `dev`

---

## File Map

**New files (lib):**
- `libs/db-strategies/postgres/project.json`
- `libs/db-strategies/postgres/package.json`
- `libs/db-strategies/postgres/tsconfig.json`
- `libs/db-strategies/postgres/tsconfig.lib.json`
- `libs/db-strategies/postgres/tsconfig.spec.json`
- `libs/db-strategies/postgres/vitest.config.mts`
- `libs/db-strategies/postgres/eslint.config.mjs`
- `libs/db-strategies/postgres/src/index.ts`
- `libs/db-strategies/postgres/src/lib/postgres-db.strategy.ts`
- `libs/db-strategies/postgres/src/lib/postgres-db.module.ts`
- `libs/db-strategies/postgres/src/lib/testing/mock-postgres.ts`
- `libs/db-strategies/postgres/src/lib/__tests__/postgres-db.contract.unit.test.ts`
- `libs/db-strategies/postgres/src/lib/__tests__/postgres-db.module.unit.test.ts`

**New files (blueprint — mirrors lib exactly):**
- `tools/create-icore/templates/libs/db-strategies/postgres/` — same 13 files as above

**Modified:**
- `tsconfig.base.json` — add `@icore/db-postgres` path alias
- `tools/create-icore/src/lib/options.ts` — add `'postgres'` to `DbProvider`
- `tools/create-icore/src/manifest/index.ts` — add `db.postgres` entry
- `tools/create-icore/src/lib/prompts.ts` — add postgres option to DB prompt
- `AGENTS.md` — add PostgreSQL provider-specific setup section
- `.changeset/<slug>.md` — new changeset

---

### Task 1: Postgres DB strategy lib scaffolding

**Files:**
- Create: `libs/db-strategies/postgres/project.json`
- Create: `libs/db-strategies/postgres/package.json`
- Create: `libs/db-strategies/postgres/tsconfig.json`
- Create: `libs/db-strategies/postgres/tsconfig.lib.json`
- Create: `libs/db-strategies/postgres/tsconfig.spec.json`
- Create: `libs/db-strategies/postgres/vitest.config.mts`
- Create: `libs/db-strategies/postgres/eslint.config.mjs`
- Modify: `tsconfig.base.json`

**Interfaces:**
- Produces: Nx lib `db-postgres`, path alias `@icore/db-postgres`, buildable with `yarn nx build db-postgres`

- [ ] **Step 1: Create branch**

```bash
git checkout dev && git pull && git checkout -b feature/postgres-db-strategy
```

- [ ] **Step 2: Create `libs/db-strategies/postgres/project.json`**

```json
{
  "name": "db-postgres",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/db-strategies/postgres/src",
  "projectType": "library",
  "tags": [],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/db-strategies/postgres",
        "main": "libs/db-strategies/postgres/src/index.ts",
        "tsConfig": "libs/db-strategies/postgres/tsconfig.lib.json",
        "assets": ["libs/db-strategies/postgres/*.md"]
      }
    }
  }
}
```

- [ ] **Step 3: Create `libs/db-strategies/postgres/package.json`**

```json
{
  "name": "@icore/db-postgres",
  "version": "0.0.1",
  "private": true,
  "type": "commonjs",
  "main": "./src/index.js",
  "types": "./src/index.ts",
  "dependencies": {
    "@icore/shared": "*",
    "@nestjs/common": "^11.1.27",
    "@nestjs/config": "^4.0.4",
    "postgres": "^3.4.5",
    "tslib": "^2.8.1"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.1.27",
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 4: Create `libs/db-strategies/postgres/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "node16",
    "moduleResolution": "node16",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "importHelpers": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

- [ ] **Step 5: Create `libs/db-strategies/postgres/tsconfig.lib.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "rootDir": "../../..",
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "vite.config.ts", "vite.config.mts", "vitest.config.ts", "vitest.config.mts",
    "src/**/*.test.ts", "src/**/*.spec.ts", "src/**/*.test.tsx", "src/**/*.spec.tsx",
    "src/**/*.test.js", "src/**/*.spec.js", "src/**/*.test.jsx", "src/**/*.spec.jsx"
  ]
}
```

- [ ] **Step 6: Create `libs/db-strategies/postgres/tsconfig.spec.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "types": ["vitest/globals", "vitest/importMeta", "vite/client", "node", "vitest"]
  },
  "include": [
    "vite.config.ts", "vite.config.mts", "vitest.config.ts", "vitest.config.mts",
    "src/**/*.test.ts", "src/**/*.spec.ts", "src/**/*.test.tsx", "src/**/*.spec.tsx",
    "src/**/*.test.js", "src/**/*.spec.js", "src/**/*.test.jsx", "src/**/*.spec.jsx",
    "src/**/*.d.ts"
  ]
}
```

- [ ] **Step 7: Create `libs/db-strategies/postgres/vitest.config.mts`**

```typescript
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/db-strategies/postgres',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'db-postgres',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/db-strategies/postgres',
      provider: 'v8' as const,
    },
  },
}));
```

- [ ] **Step 8: Create `libs/db-strategies/postgres/eslint.config.mjs`**

```javascript
import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
          ],
          ignoredDependencies: [
            '@icore/shared',
            'postgres',
            '@nestjs/testing',
            'vitest',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
```

- [ ] **Step 9: Add path alias to `tsconfig.base.json`**

Find the block containing `"@icore/db-mongodb"` and add a new line before it:

```json
"@icore/db-postgres": ["./libs/db-strategies/postgres/src/index.ts"],
```

Result in tsconfig.base.json (the three db aliases together):
```json
"@icore/db-supabase": ["./libs/db-strategies/supabase/src/index.ts"],
"@icore/db-firestore": ["./libs/db-strategies/firestore/src/index.ts"],
"@icore/db-postgres": ["./libs/db-strategies/postgres/src/index.ts"],
"@icore/db-mongodb": ["./libs/db-strategies/mongodb/src/index.ts"],
```

- [ ] **Step 10: Install `postgres` package**

```bash
yarn add postgres@^3 --cwd libs/db-strategies/postgres 2>/dev/null || yarn add postgres@^3
```

Actually in Yarn 4 workspaces, add to workspace root `package.json` dependencies (or rely on workspace:* resolution). Check if `postgres` already in root:

```bash
grep '"postgres"' package.json
```

If not present, add it:

```bash
yarn add postgres@^3
```

- [ ] **Step 11: Commit scaffolding**

```bash
npx prettier --write libs/db-strategies/postgres/
git add libs/db-strategies/postgres/ tsconfig.base.json package.json yarn.lock
git commit -m "chore(db-postgres): scaffold lib project.json, package.json, tsconfig, vitest config"
```

---

### Task 2: PostgresDBStrategy implementation + contract tests

**Files:**
- Create: `libs/db-strategies/postgres/src/lib/testing/mock-postgres.ts`
- Create: `libs/db-strategies/postgres/src/lib/postgres-db.strategy.ts`
- Create: `libs/db-strategies/postgres/src/lib/__tests__/postgres-db.contract.unit.test.ts`

**Interfaces:**
- Consumes: `DBStrategy`, `DBDocument`, `QueryOptions`, `DocumentId` from `@icore/shared`
- Produces:
  - `createMockPostgresDB(): DBStrategy` — in-memory mock implementing DBStrategy directly
  - `PostgresDBStrategy` class — constructor `(url: string)`

- [ ] **Step 1: Write the failing contract test**

Create `libs/db-strategies/postgres/src/lib/__tests__/postgres-db.contract.unit.test.ts`:

```typescript
import { runDBContract } from '@icore/shared/testing';
import { PostgresDBStrategy } from '../postgres-db.strategy.js';
import { createMockPostgresDB } from '../testing/mock-postgres.js';

runDBContract('PostgresDBStrategy', () => createMockPostgresDB());
```

- [ ] **Step 2: Run test — verify it fails (module not found)**

```bash
yarn nx test db-postgres --testFile=src/lib/__tests__/postgres-db.contract.unit.test.ts
```

Expected: FAIL — `Cannot find module '../postgres-db.strategy.js'`

- [ ] **Step 3: Create in-memory mock `libs/db-strategies/postgres/src/lib/testing/mock-postgres.ts`**

The mock implements `DBStrategy` directly (not wrapping `postgres.Sql`) so tests run without a real database.

```typescript
import type { DBDocument, DBStrategy, QueryOptions } from '@icore/shared';

function applyOp(val: unknown, op: string, target: unknown): boolean {
  switch (op) {
    case '==':
      return String(val) === String(target);
    case '!=':
      return String(val) !== String(target);
    case '<':
      return Number(val) < Number(target);
    case '<=':
      return Number(val) <= Number(target);
    case '>':
      return Number(val) > Number(target);
    case '>=':
      return Number(val) >= Number(target);
    case 'in':
      return Array.isArray(target) && (target as unknown[]).map(String).includes(String(val));
    default:
      return false;
  }
}

function resolveField(data: Record<string, unknown>, id: string, field: string): unknown {
  if (field === 'id') return id;
  return data[field];
}

export function createMockPostgresDB(): DBStrategy {
  const store = new Map<string, Map<string, Record<string, unknown>>>();

  function getTable(collection: string): Map<string, Record<string, unknown>> {
    let t = store.get(collection);
    if (!t) {
      t = new Map();
      store.set(collection, t);
    }
    return t;
  }

  return {
    async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
      const row = getTable(collection).get(id);
      if (!row) return null;
      return { id, data: row as T };
    },

    async set<T>(collection: string, id: string, data: T): Promise<void> {
      getTable(collection).set(id, { ...(data as Record<string, unknown>) });
    },

    async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
      const table = getTable(collection);
      const existing = table.get(id);
      if (!existing) throw new Error(`not_found: ${collection}/${id}`);
      table.set(id, { ...existing, ...(patch as Record<string, unknown>) });
    },

    async delete(collection: string, id: string): Promise<void> {
      const table = getTable(collection);
      if (!table.has(id)) throw new Error(`not_found: ${collection}/${id}`);
      table.delete(id);
    },

    async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
      let entries = [...getTable(collection).entries()].map(([id, data]) => ({ id, data }));

      if (opts?.where) {
        for (const c of opts.where) {
          entries = entries.filter((e) => {
            const val = resolveField(e.data, e.id, c.field);
            return applyOp(val, c.op, c.value);
          });
        }
      }

      if (opts?.orderBy) {
        const { field, direction } = opts.orderBy;
        entries.sort((a, b) => {
          const av = resolveField(a.data, a.id, field);
          const bv = resolveField(b.data, b.id, field);
          const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
          return direction === 'desc' ? -cmp : cmp;
        });
      }

      if (opts?.limit != null) {
        entries = entries.slice(0, opts.limit);
      }

      return entries.map((e) => ({ id: e.id, data: e.data as T }));
    },
  };
}
```

- [ ] **Step 4: Create `libs/db-strategies/postgres/src/lib/postgres-db.strategy.ts`**

```typescript
import postgres from 'postgres';
import type { DBDocument, DBStrategy, QueryOptions } from '@icore/shared';

export class PostgresDBStrategy implements DBStrategy {
  private readonly sql: postgres.Sql;
  private readonly initialized = new Set<string>();

  constructor(url: string) {
    this.sql = postgres(url);
  }

  private async ensureTable(collection: string): Promise<void> {
    if (this.initialized.has(collection)) return;
    // DDL runs once per collection per process lifetime
    await this.sql`
      CREATE TABLE IF NOT EXISTS ${this.sql(collection)} (
        id   TEXT PRIMARY KEY,
        data JSONB NOT NULL
      )
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS ${this.sql(collection + '_data_gin')}
      ON ${this.sql(collection)} USING GIN (data)
    `;
    this.initialized.add(collection);
  }

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    await this.ensureTable(collection);
    const rows = await this.sql<{ id: string; data: T }[]>`
      SELECT id, data FROM ${this.sql(collection)} WHERE id = ${id}
    `;
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, data: row.data };
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    await this.ensureTable(collection);
    await this.sql`
      INSERT INTO ${this.sql(collection)} (id, data)
      VALUES (${id}, ${this.sql.json(data as object)})
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
    `;
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const existing = await this.get<T>(collection, id);
    if (!existing) throw new Error(`not_found: ${collection}/${id}`);
    const merged = { ...(existing.data as object), ...(patch as object) };
    await this.sql`
      UPDATE ${this.sql(collection)}
      SET data = ${this.sql.json(merged)}
      WHERE id = ${id}
    `;
  }

  async delete(collection: string, id: string): Promise<void> {
    const existing = await this.get(collection, id);
    if (!existing) throw new Error(`not_found: ${collection}/${id}`);
    await this.sql`DELETE FROM ${this.sql(collection)} WHERE id = ${id}`;
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    await this.ensureTable(collection);

    const conditions: postgres.PendingQuery<postgres.Row[]>[] = [];

    if (opts?.where) {
      for (const c of opts.where) {
        const field = c.field;
        if (c.op === '==' || c.op === '!=') {
          const expr = field === 'id'
            ? this.sql`id`
            : this.sql`data->>${field}`;
          conditions.push(
            c.op === '=='
              ? this.sql`${expr} = ${String(c.value)}`
              : this.sql`${expr} != ${String(c.value)}`,
          );
        } else if (c.op === 'in') {
          const vals = (c.value as unknown[]).map(String);
          const expr = field === 'id' ? this.sql`id` : this.sql`data->>${field}`;
          conditions.push(this.sql`${expr} = ANY(${vals})`);
        } else {
          // numeric ops: <, <=, >, >=
          const expr = field === 'id'
            ? this.sql`id::numeric`
            : this.sql`(data->>${field})::numeric`;
          const val = Number(c.value);
          if (c.op === '<') conditions.push(this.sql`${expr} < ${val}`);
          else if (c.op === '<=') conditions.push(this.sql`${expr} <= ${val}`);
          else if (c.op === '>') conditions.push(this.sql`${expr} > ${val}`);
          else if (c.op === '>=') conditions.push(this.sql`${expr} >= ${val}`);
        }
      }
    }

    const whereClause =
      conditions.length > 0
        ? this.sql`WHERE ${conditions.reduce((acc, c) => this.sql`${acc} AND ${c}`)}`
        : this.sql``;

    const orderClause = opts?.orderBy
      ? (() => {
          const f = opts.orderBy!.field;
          const col = f === 'id' ? this.sql`id` : this.sql`data->>${f}`;
          const dir = opts.orderBy!.direction === 'desc' ? this.sql`DESC` : this.sql`ASC`;
          return this.sql`ORDER BY ${col} ${dir}`;
        })()
      : this.sql``;

    const limitClause =
      opts?.limit != null ? this.sql`LIMIT ${opts.limit}` : this.sql``;

    const rows = await this.sql<{ id: string; data: T }[]>`
      SELECT id, data FROM ${this.sql(collection)}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    return rows.map((row) => ({ id: row.id, data: row.data }));
  }

  async end(): Promise<void> {
    await this.sql.end();
  }
}
```

- [ ] **Step 5: Run contract tests — verify they pass**

```bash
yarn nx test db-postgres --testFile=src/lib/__tests__/postgres-db.contract.unit.test.ts
```

Expected: All contract tests PASS (they run against the in-memory mock).

- [ ] **Step 6: Create `libs/db-strategies/postgres/src/index.ts`** (partial — module added in Task 3)

```typescript
export * from './lib/postgres-db.strategy';
export * from './lib/testing/mock-postgres';
```

- [ ] **Step 7: Prettier + lint + build**

```bash
npx prettier --write libs/db-strategies/postgres/src/
yarn nx lint db-postgres
yarn nx build db-postgres
```

Expected: 0 lint errors, build green.

- [ ] **Step 8: Commit**

```bash
git add libs/db-strategies/postgres/src/
git commit -m "feat(db-postgres): add PostgresDBStrategy with postgres.js + in-memory mock + contract tests"
```

---

### Task 3: NestJS module + module unit test

**Files:**
- Create: `libs/db-strategies/postgres/src/lib/postgres-db.module.ts`
- Create: `libs/db-strategies/postgres/src/lib/__tests__/postgres-db.module.unit.test.ts`
- Modify: `libs/db-strategies/postgres/src/index.ts`

**Interfaces:**
- Consumes: `PostgresDBStrategy` (Task 2), `buildStrategyWithFallback`, `FakeDBStrategy` from `@icore/shared`
- Produces:
  - `PostgresDbModule.forRoot(envPath: string): DynamicModule`
  - `POSTGRES_DB_REQUIRED_ENV: string[]` — exported constant, value `['POSTGRES_URL']`

- [ ] **Step 1: Write the failing module test**

Create `libs/db-strategies/postgres/src/lib/__tests__/postgres-db.module.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PostgresDbModule, POSTGRES_DB_REQUIRED_ENV } from '../postgres-db.module.js';
import { PostgresDBStrategy } from '../postgres-db.strategy.js';

let ENV: Record<string, string | undefined> = {};

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (k: string) => ENV[k],
        getOrThrow: (k: string) => ENV[k],
      },
    },
  ],
  exports: [ConfigService],
})
class StubConfigModule {}

describe('PostgresDbModule', () => {
  it('declares its required env', () => {
    expect(POSTGRES_DB_REQUIRED_ENV).toEqual(['POSTGRES_URL']);
  });

  it('provides a real PostgresDBStrategy under DBStrategy when env present', async () => {
    ENV = { POSTGRES_URL: 'postgresql://user:pass@localhost:5432/test' };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, PostgresDbModule.forRoot('.env')],
    }).compile();
    expect(ref.get('DBStrategy')).toBeInstanceOf(PostgresDBStrategy);
  });
});
```

- [ ] **Step 2: Run test — verify it fails (module not found)**

```bash
yarn nx test db-postgres --testFile=src/lib/__tests__/postgres-db.module.unit.test.ts
```

Expected: FAIL — `Cannot find module '../postgres-db.module.js'`

- [ ] **Step 3: Create `libs/db-strategies/postgres/src/lib/postgres-db.module.ts`**

```typescript
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { PostgresDBStrategy } from './postgres-db.strategy';

export const POSTGRES_DB_REQUIRED_ENV = ['POSTGRES_URL'];

@Module({})
export class PostgresDbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: PostgresDbModule,
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'postgres',
              requiredEnv: POSTGRES_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new PostgresDBStrategy(cfg.getOrThrow<string>('POSTGRES_URL')),
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

- [ ] **Step 4: Run module test — verify it passes**

```bash
yarn nx test db-postgres --testFile=src/lib/__tests__/postgres-db.module.unit.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Update `libs/db-strategies/postgres/src/index.ts`** — add module export

```typescript
export * from './lib/postgres-db.strategy';
export * from './lib/testing/mock-postgres';
export * from './lib/postgres-db.module';
```

- [ ] **Step 6: Run all tests for this lib**

```bash
yarn nx test db-postgres
```

Expected: All tests pass (contract + module).

- [ ] **Step 7: Prettier + lint + build**

```bash
npx prettier --write libs/db-strategies/postgres/src/lib/postgres-db.module.ts libs/db-strategies/postgres/src/lib/__tests__/postgres-db.module.unit.test.ts libs/db-strategies/postgres/src/index.ts
yarn nx lint db-postgres
yarn nx build db-postgres
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add libs/db-strategies/postgres/src/lib/postgres-db.module.ts \
        libs/db-strategies/postgres/src/lib/__tests__/postgres-db.module.unit.test.ts \
        libs/db-strategies/postgres/src/index.ts
git commit -m "feat(db-postgres): add PostgresDbModule with buildStrategyWithFallback + module unit test"
```

---

### Task 4: Blueprint in create-icore templates

**Files:**
- Create: `tools/create-icore/templates/libs/db-strategies/postgres/` (mirror of libs/db-strategies/postgres/)

**Interfaces:**
- Consumes: All files from Tasks 1–3 (copy them into templates)
- Produces: Blueprint that `create-icore` copies into generated workspaces when `--db=postgres`

- [ ] **Step 1: Copy lib files into blueprint directory**

```bash
mkdir -p tools/create-icore/templates/libs/db-strategies/postgres/src/lib/__tests__
mkdir -p tools/create-icore/templates/libs/db-strategies/postgres/src/lib/testing

cp libs/db-strategies/postgres/project.json \
   libs/db-strategies/postgres/package.json \
   libs/db-strategies/postgres/tsconfig.json \
   libs/db-strategies/postgres/tsconfig.lib.json \
   libs/db-strategies/postgres/tsconfig.spec.json \
   libs/db-strategies/postgres/vitest.config.mts \
   libs/db-strategies/postgres/eslint.config.mjs \
   tools/create-icore/templates/libs/db-strategies/postgres/

cp libs/db-strategies/postgres/src/index.ts \
   tools/create-icore/templates/libs/db-strategies/postgres/src/

cp libs/db-strategies/postgres/src/lib/postgres-db.strategy.ts \
   libs/db-strategies/postgres/src/lib/postgres-db.module.ts \
   tools/create-icore/templates/libs/db-strategies/postgres/src/lib/

cp libs/db-strategies/postgres/src/lib/testing/mock-postgres.ts \
   tools/create-icore/templates/libs/db-strategies/postgres/src/lib/testing/

cp libs/db-strategies/postgres/src/lib/__tests__/postgres-db.contract.unit.test.ts \
   libs/db-strategies/postgres/src/lib/__tests__/postgres-db.module.unit.test.ts \
   tools/create-icore/templates/libs/db-strategies/postgres/src/lib/__tests__/
```

- [ ] **Step 2: Verify blueprint structure matches lib**

```bash
diff <(find libs/db-strategies/postgres -type f | sed 's|libs/db-strategies/postgres/||' | sort) \
     <(find tools/create-icore/templates/libs/db-strategies/postgres -type f | sed 's|tools/create-icore/templates/libs/db-strategies/postgres/||' | sort)
```

Expected: no diff output (structures identical).

- [ ] **Step 3: Commit blueprint**

```bash
git add tools/create-icore/templates/libs/db-strategies/postgres/
git commit -m "feat(create-icore): add postgres db strategy blueprint in templates"
```

---

### Task 5: CLI wiring — options, manifest, prompts

**Files:**
- Modify: `tools/create-icore/src/lib/options.ts`
- Modify: `tools/create-icore/src/manifest/index.ts`
- Modify: `tools/create-icore/src/lib/prompts.ts`

**Interfaces:**
- Consumes: Blueprint from Task 4
- Produces: `create-icore --db=postgres` generates `PostgresDbModule.forRoot(...)` in `db.provider.ts`

- [ ] **Step 1: Write failing test for the new manifest entry**

Run existing tests first to confirm baseline:

```bash
yarn nx test create-icore
```

Expected: All 159 tests pass.

- [ ] **Step 2: Update `tools/create-icore/src/lib/options.ts`**

Change:
```typescript
export type DbProvider = 'supabase' | 'firebase' | 'mongodb' | 'none';
```

To:
```typescript
export type DbProvider = 'supabase' | 'firebase' | 'mongodb' | 'postgres' | 'none';
```

- [ ] **Step 3: Add `postgres` entry to `tools/create-icore/src/manifest/index.ts`**

In the `db:` section, after the `mongodb` entry, add:

```typescript
    postgres: {
      libDirs: ['libs/db-strategies/postgres'],
      deps: { postgres: '^3' },
      tsPaths: { '@icore/db-postgres': ['libs/db-strategies/postgres/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/db-postgres',
        symbol: 'PostgresDbModule',
        into: 'notes',
      },
    },
```

- [ ] **Step 4: Add postgres option to DB prompt in `tools/create-icore/src/lib/prompts.ts`**

Find the DB provider `p.select` call (around the `dbProvider` variable assignment). Add the postgres option:

```typescript
        options: [
            { value: 'supabase', label: 'Supabase Postgres' },
            { value: 'firebase', label: 'Firestore' },
            { value: 'mongodb', label: 'MongoDB' },
            { value: 'postgres', label: 'PostgreSQL (direct, postgres.js)' },
          ],
```

- [ ] **Step 5: Run existing tests**

```bash
yarn nx test create-icore
```

Expected: All existing tests still pass. New `postgres` option appears in manifests but no tests yet.

- [ ] **Step 6: Update `tools/create-icore/src/manifest/__tests__/wire-db.unit.test.ts`**

Three changes in `fixture()` and the existing tests:

**a) Add `'postgres'` to the lib-dirs loop** (line 14):
```typescript
for (const d of ['supabase', 'firestore', 'mongodb', 'postgres']) {
```

**b) Add `@icore/db-postgres` to the tsconfig paths fixture** (after `@icore/db-mongodb` entry):
```typescript
'@icore/db-postgres': ['libs/db-strategies/postgres/src/index.ts'],
```

**c) Add a `writeDbProvider` test for postgres** (inside the `describe('writeDbProvider', ...)` block, after the firebase test):
```typescript
it('wires the chosen db module (postgres)', async () => {
  const dir = await fixture();
  await writeDbProvider(dir, 'postgres');
  const src = await readFile(
    join(dir, 'apps/microservices/notes/src/app/db.provider.ts'),
    'utf8',
  );
  expect(src).toContain("from '@icore/db-postgres'");
  expect(src).toContain('PostgresDbModule.forRoot');
  expect(src).not.toContain('SupabaseDbModule');
});
```

**d) Add `postgres` cleanup assertion in the `cleanupUnusedDb` test** (after line `expect(await exists(join(dir, 'libs/db-strategies/mongodb'))).toBe(false);`):
```typescript
expect(await exists(join(dir, 'libs/db-strategies/postgres'))).toBe(false);
```

- [ ] **Step 7: Run tests to confirm new tests pass**

```bash
yarn nx test create-icore
```

Expected: All tests pass (159 + new ones = 161+).

- [ ] **Step 8: Prettier + lint**

```bash
npx prettier --write \
  tools/create-icore/src/lib/options.ts \
  tools/create-icore/src/manifest/index.ts \
  tools/create-icore/src/lib/prompts.ts
yarn nx lint create-icore
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add tools/create-icore/src/lib/options.ts \
        tools/create-icore/src/manifest/index.ts \
        tools/create-icore/src/lib/prompts.ts \
        tools/create-icore/src/manifest/__tests__/
git commit -m "feat(create-icore): add postgres DbProvider option, manifest entry, and prompt choice"
```

---

### Task 6: AGENTS.md docs + changeset + PR

**Files:**
- Modify: `AGENTS.md`
- Create: `.changeset/postgres-db-strategy.md`

**Interfaces:**
- Produces: Docs, changeset, PR on `dev`

- [ ] **Step 1: Add PostgreSQL setup section to `AGENTS.md`**

Find the `### MongoDB (auth + storage + db)` section. Add a new section after it:

```markdown
### PostgreSQL (db only)

**Env vars:**

```
DB_PROVIDER=postgres
POSTGRES_URL=postgresql://user:pass@host:5432/dbname
```

**Setup:**

1. Any PostgreSQL >= 14 instance works: Docker, Neon, Railway, AWS RDS, self-hosted.
2. No schema setup required — tables auto-created on first write per collection.
3. GIN index on `data` JSONB column created automatically per collection.

**Schema:** Each collection maps to one table: `id TEXT PRIMARY KEY, data JSONB NOT NULL`.

**Note:** `POSTGRES_URL` must include credentials. For SSL, append `?sslmode=require` to the URL.
```

- [ ] **Step 2: Create changeset**

Create `.changeset/postgres-db-strategy.md`:

```markdown
---
"@idevconn/create-icore": minor
---

Add PostgreSQL direct DB strategy (`--db=postgres`) using postgres.js with JSONB document storage and auto-created GIN indexes.
```

Use `minor` (new feature, not a fix).

- [ ] **Step 3: Final full test run**

```bash
yarn nx run-many -t lint test build --projects=db-postgres,create-icore
```

Expected: All green.

- [ ] **Step 4: Prettier all touched files**

```bash
npx prettier --write AGENTS.md
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md .changeset/postgres-db-strategy.md
git commit -m "docs: add PostgreSQL db strategy setup docs and changeset"
```

- [ ] **Step 6: Check PR state before pushing**

```bash
gh pr list --state all --limit 10
```

Confirm no existing PR for this branch.

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin feature/postgres-db-strategy
gh pr create --base dev \
  --title "feat(db-postgres): add PostgreSQL direct DB strategy via postgres.js" \
  --body "$(cat <<'EOF'
## Summary

- New `@icore/db-postgres` lib with `PostgresDBStrategy` using `postgres.js`
- JSONB schema (`id TEXT PRIMARY KEY, data JSONB NOT NULL`) + GIN index auto-created per collection
- `FakeDBStrategy` fallback in dev when `POSTGRES_URL` missing
- Full `runDBContract` test coverage via in-memory mock
- Blueprint copied to `tools/create-icore/templates/libs/db-strategies/postgres/`
- CLI: new `--db=postgres` option in `create-icore` (options, manifest, prompts)
- AGENTS.md setup docs + `minor` changeset

## Test plan

- [ ] `yarn nx test db-postgres` — all contract + module tests pass
- [ ] `yarn nx build db-postgres` — clean build
- [ ] `yarn nx lint db-postgres` — 0 errors
- [ ] `yarn nx test create-icore` — all existing tests pass + new manifest test

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Report PR URL and CI status**

```bash
gh pr view --web 2>/dev/null || gh pr list --head feature/postgres-db-strategy
```

Wait for CI green before reporting done.
