# PostgreSQL Auth Strategy Design

**Date:** 2026-06-30
**Branch:** feature/postgres-auth-strategy (to be cut from dev)

## Problem

Three auth strategies exist (Supabase, Firebase, MongoDB). All require either a managed cloud service or a separate MongoDB instance. No strategy exists for self-hosted PostgreSQL — where the same database used for application data also stores users and sessions. Useful for teams running `--auth=postgres --db=postgres` with a single Postgres instance and no external services.

## Goal

Add `@icore/auth-postgres` — a fourth auth strategy using `postgres.js`, bcrypt + JWT, users and sessions stored in auto-created PostgreSQL tables. Wire into `create-icore` as `--auth=postgres`.

## Decisions

| Question           | Decision                             | Reason                                                         |
| ------------------ | ------------------------------------ | -------------------------------------------------------------- |
| Client             | `postgres` (postgres.js v3)          | Same as `@icore/db-postgres` — consistent, already peer dep    |
| Password hashing   | `bcrypt` (rounds=10)                 | Same as MongoDB strategy                                       |
| Token              | JWT (access) + UUID (refresh)        | Same as MongoDB strategy                                       |
| Table prefix       | `_icore_`                            | Avoids conflict with user-owned tables (e.g. existing `users`) |
| last_logged_in     | Tracked per user                     | Updated on `signIn` and `refresh`                              |
| Magic link / OAuth | `throw new Error('not_implemented')` | Same as MongoDB; out of scope                                  |

## Schema

Auto-created on first call (no migration required):

```sql
CREATE TABLE IF NOT EXISTS _icore_users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT,
  role           TEXT,
  last_logged_in TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS _icore_sessions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  refresh_token  TEXT UNIQUE NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL
);
```

## Environment Variables

| Variable                 | Required | Default | Description                          |
| ------------------------ | -------- | ------- | ------------------------------------ |
| `POSTGRES_URL`           | yes      | —       | PostgreSQL connection string         |
| `JWT_SECRET`             | yes      | —       | Secret for signing JWTs              |
| `JWT_EXPIRES_IN`         | no       | `15m`   | Access token TTL (e.g. `15m`, `1h`)  |
| `JWT_REFRESH_EXPIRES_IN` | no       | `7d`    | Refresh token TTL (e.g. `7d`, `30d`) |

## Architecture

### File Structure

```
libs/auth-strategies/postgres/
├── project.json
├── package.json                              # name: "@icore/auth-postgres"
├── tsconfig.json / tsconfig.lib.json / tsconfig.spec.json
├── vitest.config.mts
├── eslint.config.mjs
└── src/
    ├── index.ts
    └── lib/
        ├── postgres-auth.strategy.ts         # implements AuthStrategy
        ├── postgres-auth.module.ts           # NestJS DynamicModule.forRoot(envPath)
        ├── testing/
        │   └── mock-postgres-auth.ts         # in-memory AuthStrategy mock
        └── __tests__/
            ├── postgres-auth.contract.unit.test.ts   # runAuthContract(...)
            └── postgres-auth.module.unit.test.ts
```

### `postgres-auth.strategy.ts`

```typescript
export interface PostgresAuthStrategyOptions {
  url: string;
  jwtSecret: string;
  jwtExpiresIn?: string;       // default '15m'
  refreshExpiresIn?: string;   // default '7d'
}

export class PostgresAuthStrategy implements AuthStrategy {
  private readonly sql: postgres.Sql;
  private tablesReady = false;

  constructor(private readonly opts: PostgresAuthStrategyOptions) {
    this.sql = postgres(opts.url);
  }

  private async ensureTables(): Promise<void> { ... }

  async verifyToken(token: string): Promise<VerifiedToken> { ... }
  async signIn(email, password): Promise<AuthSession> {
    // bcrypt.compare → UPDATE last_logged_in → createSession
  }
  async signUp(email, password): Promise<AuthSession> {
    // check duplicate → bcrypt.hash(10) → INSERT → createSession
  }
  async refresh(refreshToken): Promise<AuthSession> {
    // find session, check expires_at, DELETE old, UPDATE last_logged_in → createSession
  }
  async setRole(uid, role): Promise<void> { ... }
  async getRole(uid): Promise<string | null> { ... }
  async sendMagicLink(): Promise<void> { throw new Error('not_implemented') }
  async verifyMagicLink(): Promise<AuthSession> { throw new Error('not_implemented') }
  async startOAuth(): Promise<OAuthStartResult> { throw new Error('not_implemented') }
  async completeOAuth(): Promise<AuthSession> { throw new Error('not_implemented') }

  private async createSession(user): Promise<AuthSession> {
    // jwt.sign access token, randomUUID refresh token, INSERT _icore_sessions
  }

  async end(): Promise<void> { await this.sql.end(); }
}
```

### `postgres-auth.module.ts`

```typescript
export const POSTGRES_AUTH_REQUIRED_ENV = ['POSTGRES_URL', 'JWT_SECRET'];

@Module({})
export class PostgresAuthModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: PostgresAuthModule,
      providers: [
        {
          provide: 'AuthStrategy',
          useFactory: (cfg: ConfigService): AuthStrategy =>
            buildStrategyWithFallback<AuthStrategy>({
              service: 'auth MS',
              provider: 'postgres',
              requiredEnv: POSTGRES_AUTH_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new PostgresAuthStrategy({
                  url: cfg.getOrThrow('POSTGRES_URL'),
                  jwtSecret: cfg.getOrThrow('JWT_SECRET'),
                  jwtExpiresIn: cfg.get('JWT_EXPIRES_IN'),
                  refreshExpiresIn: cfg.get('JWT_REFRESH_EXPIRES_IN'),
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

## `ensureTables` Implementation

Simple boolean guard (single process, no concurrency risk vs. DDL):

```typescript
private async ensureTables(): Promise<void> {
  if (this.tablesReady) return;
  await this.sql`CREATE TABLE IF NOT EXISTS _icore_users (...)`;
  await this.sql`CREATE TABLE IF NOT EXISTS _icore_sessions (...)`;
  this.tablesReady = true;
}
```

No Map-based in-flight dedup needed — `ensureTables` is called once per strategy instance before the first auth operation. `CREATE TABLE IF NOT EXISTS` is idempotent.

## Testing

### Contract Tests

```typescript
import { runAuthContract } from '@icore/shared/testing';
import { createMockPostgresAuth } from '../testing/mock-postgres-auth';

runAuthContract('PostgresAuthStrategy', () => createMockPostgresAuth());
```

Mock is an in-memory `Map`-based implementation — no real Postgres required.

### Module Tests

Two tests via `StubConfigModule` pattern (same as `postgres-db.module.unit.test.ts`):

1. Both required env present → returns `PostgresAuthStrategy` instance
2. Missing `JWT_SECRET` → dev: returns `FakeAuthStrategy` + logs warning

## Blueprint

`tools/create-icore/templates/libs/auth-strategies/postgres/` — mirrors lib exactly, committed with `git add -f`.

## create-icore CLI Changes

### `options.ts`

```typescript
export type AuthBackend = 'supabase' | 'firebase' | 'mongodb' | 'postgres';
```

### `manifest/index.ts`

```typescript
auth: {
  postgres: {
    libDirs: ['libs/auth-strategies/postgres'],
    deps: { postgres: '^3', bcrypt: '^5', jsonwebtoken: '^9' },
    tsPaths: { '@icore/auth-postgres': ['./libs/auth-strategies/postgres/src/index.ts'] },
    nestModule: { importFrom: '@icore/auth-postgres', symbol: 'PostgresAuthModule', into: 'auth' },
  }
}
```

### `prompts.ts`

```typescript
{ value: 'postgres', label: 'PostgreSQL (direct, postgres.js + bcrypt + JWT)' }
```

### CI smoke combo (`pipeline.yml`)

```yaml
- name: postgres-auth
  flags: --auth=postgres --db=postgres --upload=supabase --payment=none --jobs=none --example=notes --transport=tcp
```

## AGENTS.md Update

Add `PostgreSQL (auth only)` env var table under Provider-specific Setup:

```
AUTH_PROVIDER=postgres
POSTGRES_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-secret
JWT_EXPIRES_IN=15m           # optional
JWT_REFRESH_EXPIRES_IN=7d    # optional
```

## Out of Scope

- Magic link (requires email delivery)
- OAuth (requires provider registration)
- Session revocation beyond refresh token DELETE
- Index on `_icore_sessions.user_id` (acceptable at bootstrap scale)

## Test Plan

1. `runAuthContract('PostgresAuthStrategy', createMockPostgresAuth)` — all contract cases pass
2. `nx build auth-postgres` — clean build
3. `nx lint auth-postgres` — 0 errors
4. `nx test create-icore` — existing tests + new postgres auth assertions pass
5. CI scaffold smoke `postgres-auth` combo green
