# PostgreSQL DB Strategy Design

**Date:** 2026-06-29
**Branch:** bug/landing-fixes (to be implemented on feature/postgres-db-strategy)

## Problem

Three DB strategies exist (MongoDB, Supabase, Firestore). Supabase uses Postgres under the hood but requires Supabase JS client + managed infrastructure (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). No strategy exists for standalone PostgreSQL (self-hosted, Docker, Neon, Railway, RDS, etc.) via a plain `DATABASE_URL`.

## Goal

Add `@icore/db-postgres` — a fourth DB strategy using `postgres.js` and the same JSONB-document schema as the Supabase strategy. Wire it into `create-icore` as a selectable `--db=postgres` option.

## Decisions

| Question | Decision | Reason |
|----------|----------|--------|
| Client | `postgres` (postgres.js) | Template literals prevent SQL injection by default, native TypeScript, built-in pool, ~30kb |
| Schema | `id TEXT PRIMARY KEY, data JSONB NOT NULL` | Matches Supabase strategy; stays within DBStrategy contract |
| Indexing | GIN index on `data` per collection | Created on first table use; minimal cost, enables JSONB operators |
| Env var | `POSTGRES_URL` | Distinct from any Supabase vars; standard connection string |
| Deploy target | Any (Docker, RDS, Neon, Railway, self-hosted) | Single `DATABASE_URL`-style var covers all |

## Architecture

### File Structure

```
libs/db-strategies/postgres/
├── project.json
├── package.json                          # name: "@icore/db-postgres"
├── tsconfig.lib.json
└── src/
    ├── index.ts
    └── lib/
        ├── postgres-db.strategy.ts       # implements DBStrategy
        ├── postgres-db.module.ts         # NestJS DynamicModule.forRoot(envPath)
        ├── postgres-required-env.ts      # export const POSTGRES_DB_REQUIRED_ENV = ['POSTGRES_URL']
        ├── testing/
        │   └── mock-postgres.ts          # in-memory Map mock
        └── __tests__/
            └── postgres-db.strategy.unit.test.ts
```

### tsconfig.base.json path alias (to add)

```json
"@icore/db-postgres": ["./libs/db-strategies/postgres/src/index.ts"]
```

## Schema

Auto-created on first `set()` call for each collection:

```sql
CREATE TABLE IF NOT EXISTS "<collection>" (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS "<collection>_data_gin"
  ON "<collection>" USING GIN (data);
```

Table names are double-quoted to preserve case and avoid SQL keyword collisions.

## Query Operator Mapping

| DBStrategy `where` op | PostgreSQL expression |
|----------------------|-----------------------|
| `==` | `data->>'field' = ${value}` |
| `!=` | `data->>'field' != ${value}` |
| `<` | `(data->>'field')::numeric < ${value}` |
| `<=` | `(data->>'field')::numeric <= ${value}` |
| `>` | `(data->>'field')::numeric > ${value}` |
| `>=` | `(data->>'field')::numeric >= ${value}` |
| `in` | `data->>'field' = ANY(${value}::text[])` |

Numeric casting applied only for `<`, `<=`, `>`, `>=` — matches behavior in Supabase and MongoDB strategies.

## Strategy Implementation Sketch

```typescript
import postgres from 'postgres';

export class PostgresDBStrategy implements DBStrategy {
  private sql: postgres.Sql;
  private initializedCollections = new Set<string>(); // cache: skip DDL after first call

  constructor(url: string) {
    this.sql = postgres(url);
  }

  private async ensureTable(collection: string): Promise<void> {
    if (this.initializedCollections.has(collection)) return;
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
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    await this.ensureTable(collection);
    await this.sql`
      INSERT INTO ${this.sql(collection)} (id, data)
      VALUES (${id}, ${this.sql.json(data as object)})
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
    `;
  }

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    await this.ensureTable(collection);
    const rows = await this.sql`
      SELECT id, data FROM ${this.sql(collection)} WHERE id = ${id}
    `;
    if (!rows[0]) return null;
    return { id: rows[0].id, data: rows[0].data as T };
  }

  // update(), delete(), list() follow same pattern
}
```

## NestJS Module

```typescript
@Module({})
export class PostgresDbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: PostgresDbModule,
      providers: [
        {
          provide: DB_STRATEGY,
          useFactory: (config: ConfigService) =>
            new PostgresDBStrategy(config.get('POSTGRES_URL')!),
          inject: [ConfigService],
        },
      ],
      imports: [ConfigModule.forRoot({ envFilePath: envPath })],
      exports: [DB_STRATEGY],
    };
  }
}
```

## Testing

### Contract Tests

```typescript
import { runDBContract } from '@icore/shared/testing';
import { createMockPostgresDB } from '../testing/mock-postgres';

runDBContract('PostgresDBStrategy', () => createMockPostgresDB());
```

Mock is an in-memory `Map<string, Map<string, unknown>>` — no real Postgres required. Same pattern as `createMockSupabaseDB()`.

### Integration Tests (optional, CI-gated)

Skipped in unit suite. Can run against real Postgres via `TEST_POSTGRES_URL` env var if provided.

## Blueprint (templates/libs/db-strategies/postgres/)

Mirrors the Supabase blueprint exactly. Full file list:

```
tools/create-icore/templates/libs/db-strategies/postgres/
├── eslint.config.mjs
├── package.json                                     # name: "@icore/db-postgres", deps: { postgres: "^3" }
├── project.json                                     # Nx lib target config
├── README.md
├── tsconfig.json
├── tsconfig.lib.json
├── tsconfig.spec.json
├── vitest.config.mts
└── src/
    ├── index.ts                                     # re-exports strategy, module, required-env, mock
    └── lib/
        ├── postgres-db.strategy.ts
        ├── postgres-db.module.ts
        ├── testing/
        │   └── mock-postgres.ts
        └── __tests__/
            ├── postgres-db.contract.unit.test.ts    # runDBContract(...)
            └── postgres-db.module.unit.test.ts
```

Blueprint lives in `templates/` → copied into generated workspace at scaffold time by the `libDirs` manifest entry. The actual lib at `libs/db-strategies/postgres/` in the monorepo is the source of truth; templates are kept in sync manually (same as existing strategies).

## create-icore CLI Changes

### `tools/create-icore/src/lib/options.ts`

```typescript
export type DbProvider = 'supabase' | 'firebase' | 'mongodb' | 'postgres' | 'none';
```

### `tools/create-icore/src/manifest/index.ts`

```typescript
postgres: {
  libDirs: ['libs/db-strategies/postgres'],
  deps: { postgres: '^3' },
  nestModule: {
    importFrom: '@icore/db-postgres',
    symbol: 'PostgresDbModule',
    into: 'notes',
  },
  requiredEnv: 'POSTGRES_DB_REQUIRED_ENV',
  envExample: {
    POSTGRES_URL: 'postgresql://user:pass@localhost:5432/icore',
  },
}
```

### `tools/create-icore/src/lib/prompts.ts`

Add option to DB provider prompt:

```typescript
{ value: 'postgres', label: 'PostgreSQL (direct, postgres.js)' }
```

### `tools/create-icore/src/lib/templates/`

Add `.env.example` snippet for Postgres:

```
POSTGRES_URL=postgresql://user:pass@localhost:5432/icore
```

## AGENTS.md / Docs Update

Add Postgres provider section under "Provider-specific Setup":

```markdown
### PostgreSQL (db only)

**Env vars:**
POSTGRES_URL=postgresql://user:pass@host:5432/dbname

**Setup:**
1. Any Postgres >= 14 instance works (Docker, Neon, Railway, RDS, self-hosted).
2. No schema setup required — tables auto-created on first write per collection.
3. GIN index on `data` JSONB column created automatically.

**Schema:**
Each collection maps to a table: `id TEXT PRIMARY KEY, data JSONB NOT NULL`.
```

## Out of Scope

- Prisma/TypeORM/Drizzle integration (breaks DBStrategy abstraction)
- Relational schema with typed columns per entity
- Connection pool size configuration (postgres.js defaults are fine for bootstrap)
- pgvector / full-text search extensions
- SSL certificate configuration beyond `?sslmode=require` in the URL

## Test Plan

1. `runDBContract('PostgresDBStrategy', createMockPostgresDB)` — all contract cases pass
2. `nx build @icore/db-postgres` — clean build
3. `nx lint @icore/db-postgres` — 0 errors
4. `nx test create-icore` — existing 159 tests still pass after CLI changes
5. Manual: scaffold new project with `--db=postgres`, verify `db.provider.ts` generated correctly
