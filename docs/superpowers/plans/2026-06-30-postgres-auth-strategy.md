# PostgreSQL Auth Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@icore/auth-postgres` — a self-hosted auth strategy using postgres.js, bcrypt + JWT, users/sessions stored in auto-created PostgreSQL tables, wired into `create-icore` as `--auth=postgres`.

**Architecture:** Mirrors `libs/auth-strategies/mongodb` exactly — same bcrypt + JWT + refresh token pattern, same `buildStrategyWithFallback` NestJS module — but uses `postgres.js` instead of Mongoose. Two auto-created tables: `_icore_users` and `_icore_sessions`. Contract tests use an in-memory mock (no real Postgres required).

**Tech Stack:** `postgres` v3 (postgres.js), `bcrypt` ^6, `jsonwebtoken` ^9, NestJS DynamicModule, Vitest.

## Global Constraints

- Package name: `@icore/auth-postgres`
- Table names: `_icore_users`, `_icore_sessions` (prefix avoids conflict with user-owned tables)
- Required env: `POSTGRES_URL`, `JWT_SECRET`; optional: `JWT_EXPIRES_IN` (default `15m`), `JWT_REFRESH_EXPIRES_IN` (default `7d`)
- `last_logged_in TIMESTAMPTZ` column on `_icore_users`, updated on every `signIn` and `refresh`
- `sendMagicLink`, `verifyMagicLink`, `startOAuth`, `completeOAuth` → `throw new Error('not_implemented')`
- `buildStrategyWithFallback` from `@icore/shared` — dev: warn + `FakeAuthStrategy`; prod: throw
- Blueprint at `tools/create-icore/templates/libs/auth-strategies/postgres/` committed with `git add -f`
- All files run `npx prettier --write` before commit; `yarn nx lint auth-postgres` must pass; `yarn nx build auth-postgres` must pass
- Branch: `feature/postgres-auth-strategy` cut from `dev`

---

### Task 1: Scaffold lib project files + tsconfig.base.json alias

**Files:**

- Create: `libs/auth-strategies/postgres/project.json`
- Create: `libs/auth-strategies/postgres/package.json`
- Create: `libs/auth-strategies/postgres/tsconfig.json`
- Create: `libs/auth-strategies/postgres/tsconfig.lib.json`
- Create: `libs/auth-strategies/postgres/tsconfig.spec.json`
- Create: `libs/auth-strategies/postgres/vitest.config.mts`
- Create: `libs/auth-strategies/postgres/eslint.config.mjs`
- Modify: `tsconfig.base.json` — add `@icore/auth-postgres` path alias

**Interfaces:**

- Produces: `auth-postgres` Nx project, buildable via `yarn nx build auth-postgres`

- [ ] **Step 1: Create branch from dev**

```bash
git checkout dev && git pull
git checkout -b feature/postgres-auth-strategy
```

- [ ] **Step 2: Create `libs/auth-strategies/postgres/project.json`**

```json
{
  "name": "auth-postgres",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/auth-strategies/postgres/src",
  "projectType": "library",
  "tags": [],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/auth-strategies/postgres",
        "main": "libs/auth-strategies/postgres/src/index.ts",
        "tsConfig": "libs/auth-strategies/postgres/tsconfig.lib.json",
        "assets": ["libs/auth-strategies/postgres/*.md"]
      }
    }
  }
}
```

- [ ] **Step 3: Create `libs/auth-strategies/postgres/package.json`**

```json
{
  "name": "@icore/auth-postgres",
  "version": "0.0.1",
  "private": true,
  "type": "commonjs",
  "main": "./src/index.js",
  "types": "./src/index.ts",
  "dependencies": {
    "@icore/shared": "*",
    "@nestjs/common": "^11.1.27",
    "@nestjs/config": "^4.0.4",
    "bcrypt": "^6.0.0",
    "jsonwebtoken": "^9.0.3",
    "postgres": "^3.4.5",
    "tslib": "^2.8.1"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.1.27",
    "@types/bcrypt": "^6.0.0",
    "@types/jsonwebtoken": "^9.0.10",
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 4: Create `libs/auth-strategies/postgres/tsconfig.json`**

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
  "references": [{ "path": "./tsconfig.lib.json" }, { "path": "./tsconfig.spec.json" }]
}
```

- [ ] **Step 5: Create `libs/auth-strategies/postgres/tsconfig.lib.json`**

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
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx",
    "src/**/*.test.js",
    "src/**/*.spec.js",
    "src/**/*.test.jsx",
    "src/**/*.spec.jsx"
  ]
}
```

- [ ] **Step 6: Create `libs/auth-strategies/postgres/tsconfig.spec.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "types": ["vitest/globals", "vitest/importMeta", "vite/client", "node", "vitest"]
  },
  "include": [
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx",
    "src/**/*.test.js",
    "src/**/*.spec.js",
    "src/**/*.test.jsx",
    "src/**/*.spec.jsx",
    "src/**/*.d.ts"
  ]
}
```

- [ ] **Step 7: Create `libs/auth-strategies/postgres/vitest.config.mts`**

```typescript
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/auth-strategies/postgres',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'auth-postgres',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/auth-strategies/postgres',
      provider: 'v8' as const,
    },
  },
}));
```

- [ ] **Step 8: Create `libs/auth-strategies/postgres/eslint.config.mjs`**

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
            'bcrypt',
            'jsonwebtoken',
            'postgres',
            '@nestjs/common',
            '@nestjs/config',
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

Find the line `"@icore/auth-mongodb": ["./libs/auth-strategies/mongodb/src/index.ts"]` and add after it:

```json
"@icore/auth-postgres": ["./libs/auth-strategies/postgres/src/index.ts"]
```

- [ ] **Step 10: Prettier + verify build scaffolds**

```bash
npx prettier --write \
  libs/auth-strategies/postgres/project.json \
  libs/auth-strategies/postgres/package.json \
  libs/auth-strategies/postgres/tsconfig.json \
  libs/auth-strategies/postgres/tsconfig.lib.json \
  libs/auth-strategies/postgres/tsconfig.spec.json \
  libs/auth-strategies/postgres/vitest.config.mts \
  libs/auth-strategies/postgres/eslint.config.mjs \
  tsconfig.base.json
```

- [ ] **Step 11: Commit**

```bash
git add libs/auth-strategies/postgres/ tsconfig.base.json
git commit -m "chore(auth-postgres): scaffold lib project.json, package.json, tsconfig, vitest, eslint, path alias"
```

---

### Task 2: PostgresAuthStrategy + in-memory mock + contract tests

**Files:**

- Create: `libs/auth-strategies/postgres/src/index.ts`
- Create: `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`
- Create: `libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts`
- Create: `libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.contract.unit.test.ts`

**Interfaces:**

- Consumes: `AuthStrategy`, `AuthSession`, `VerifiedToken`, `MagicLinkRequest`, `OAuthProvider`, `OAuthStartResult` from `@icore/shared`
- Produces:
  - `PostgresAuthStrategy` class (exported from `@icore/auth-postgres`)
  - `PostgresAuthStrategyOptions` interface
  - `createMockPostgresAuth(): AuthStrategy` factory (exported from `@icore/auth-postgres`)

- [ ] **Step 1: Write the failing contract test**

Create `libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.contract.unit.test.ts`:

```typescript
import { runAuthContract } from '@icore/shared/testing';
import { createMockPostgresAuth } from '../testing/mock-postgres-auth.js';

runAuthContract('PostgresAuthStrategy', () => createMockPostgresAuth());
```

- [ ] **Step 2: Run to verify it fails**

```bash
yarn nx test auth-postgres
```

Expected: FAIL — `createMockPostgresAuth` not found.

- [ ] **Step 3: Create in-memory mock `libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  VerifiedToken,
} from '@icore/shared';

const MOCK_JWT_SECRET = 'mock-test-secret';

export function createMockPostgresAuth(): AuthStrategy {
  const users = new Map<
    string,
    { id: string; email: string; passwordHash: string; role?: string }
  >();
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();

  function buildSession(user: { id: string; email: string; role?: string }): AuthSession {
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      MOCK_JWT_SECRET,
      { expiresIn: '1h' },
    );
    const refreshToken = randomUUID();
    sessions.set(refreshToken, {
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
    });
    return { accessToken, refreshToken, expiresIn: 3600, user: { id: user.id, email: user.email } };
  }

  return {
    async signUp(email: string, password: string): Promise<AuthSession> {
      if ([...users.values()].find((u) => u.email === email)) {
        throw new Error('user_already_exists');
      }
      const id = randomUUID();
      const passwordHash = await bcrypt.hash(password, 10);
      users.set(id, { id, email, passwordHash });
      return buildSession({ id, email });
    },

    async signIn(email: string, password: string): Promise<AuthSession> {
      const user = [...users.values()].find((u) => u.email === email);
      if (!user) throw new Error('invalid_credentials');
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) throw new Error('invalid_credentials');
      return buildSession(user);
    },

    async verifyToken(token: string): Promise<VerifiedToken> {
      try {
        const decoded = jwt.verify(token, MOCK_JWT_SECRET) as jwt.JwtPayload;
        return {
          uid: decoded.sub as string,
          email: decoded['email'] as string,
          role: decoded['role'] as string,
        };
      } catch (err) {
        throw new Error('invalid_token', { cause: err });
      }
    },

    async refresh(refreshToken: string): Promise<AuthSession> {
      const session = sessions.get(refreshToken);
      if (!session || session.expiresAt < new Date()) {
        sessions.delete(refreshToken);
        throw new Error('invalid_refresh_token');
      }
      const user = users.get(session.userId);
      if (!user) throw new Error('user_not_found');
      sessions.delete(refreshToken);
      return buildSession(user);
    },

    async setRole(uid: string, role: string): Promise<void> {
      const user = users.get(uid);
      if (user) user.role = role;
    },

    async getRole(uid: string): Promise<string | null> {
      return users.get(uid)?.role ?? null;
    },

    async sendMagicLink(_req: MagicLinkRequest): Promise<void> {
      throw new Error('not_implemented');
    },
    async verifyMagicLink(_token: string): Promise<AuthSession> {
      throw new Error('not_implemented');
    },
    async startOAuth(_provider: OAuthProvider, _callbackUrl: string): Promise<OAuthStartResult> {
      throw new Error('not_implemented');
    },
    async completeOAuth(
      _provider: OAuthProvider,
      _code: string,
      _state: string,
    ): Promise<AuthSession> {
      throw new Error('not_implemented');
    },
  };
}
```

- [ ] **Step 4: Run to verify contract tests pass**

```bash
yarn nx test auth-postgres
```

Expected: PASS — all contract cases green (magic link / OAuth cases skip automatically since helpers are absent).

- [ ] **Step 5: Create `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`**

```typescript
import postgres from 'postgres';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  VerifiedToken,
} from '@icore/shared';

export interface PostgresAuthStrategyOptions {
  url: string;
  jwtSecret: string;
  jwtExpiresIn?: string;
  refreshExpiresIn?: string;
}

function parseDurationSeconds(s: string): number {
  const m = /^(\d+)(s|m|h|d)$/.exec(s);
  if (!m) return 900;
  const n = parseInt(m[1]!, 10);
  const unit = m[2]!;
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  return n * 86400;
}

function parseDurationMs(s: string): number {
  return parseDurationSeconds(s) * 1000;
}

export class PostgresAuthStrategy implements AuthStrategy {
  private readonly sql: postgres.Sql;
  private tablesReady = false;

  constructor(private readonly opts: PostgresAuthStrategyOptions) {
    this.sql = postgres(opts.url);
  }

  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    await this.sql`
      CREATE TABLE IF NOT EXISTS _icore_users (
        id             TEXT PRIMARY KEY,
        email          TEXT UNIQUE NOT NULL,
        password_hash  TEXT,
        role           TEXT,
        last_logged_in TIMESTAMPTZ,
        created_at     TIMESTAMPTZ DEFAULT now()
      )
    `;
    await this.sql`
      CREATE TABLE IF NOT EXISTS _icore_sessions (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL,
        refresh_token  TEXT UNIQUE NOT NULL,
        expires_at     TIMESTAMPTZ NOT NULL
      )
    `;
    this.tablesReady = true;
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    try {
      const decoded = jwt.verify(token, this.opts.jwtSecret) as jwt.JwtPayload;
      return {
        uid: decoded.sub as string,
        email: decoded['email'] as string,
        role: decoded['role'] as string,
      };
    } catch (err) {
      throw new Error('invalid_token', { cause: err });
    }
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    await this.ensureTables();
    const rows = await this.sql<
      { id: string; email: string; password_hash: string; role: string | null }[]
    >`
      SELECT id, email, password_hash, role FROM _icore_users WHERE email = ${email}
    `;
    const user = rows[0];
    if (!user || !user.password_hash) throw new Error('invalid_credentials');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new Error('invalid_credentials');
    await this.sql`
      UPDATE _icore_users SET last_logged_in = now() WHERE id = ${user.id}
    `;
    return this.createSession({ id: user.id, email: user.email, role: user.role ?? undefined });
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    await this.ensureTables();
    const existing = await this.sql`
      SELECT id FROM _icore_users WHERE email = ${email}
    `;
    if (existing.count > 0) throw new Error('user_already_exists');
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    await this.sql`
      INSERT INTO _icore_users (id, email, password_hash) VALUES (${id}, ${email}, ${passwordHash})
    `;
    return this.createSession({ id, email });
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    await this.ensureTables();
    const sessions = await this.sql<{ id: string; user_id: string; expires_at: Date }[]>`
      SELECT id, user_id, expires_at FROM _icore_sessions WHERE refresh_token = ${refreshToken}
    `;
    const session = sessions[0];
    if (!session || session.expires_at < new Date()) {
      if (session) {
        await this.sql`DELETE FROM _icore_sessions WHERE id = ${session.id}`;
      }
      throw new Error('invalid_refresh_token');
    }
    const users = await this.sql<{ id: string; email: string; role: string | null }[]>`
      SELECT id, email, role FROM _icore_users WHERE id = ${session.user_id}
    `;
    const user = users[0];
    if (!user) throw new Error('user_not_found');
    await this.sql`DELETE FROM _icore_sessions WHERE id = ${session.id}`;
    await this.sql`
      UPDATE _icore_users SET last_logged_in = now() WHERE id = ${user.id}
    `;
    return this.createSession({ id: user.id, email: user.email, role: user.role ?? undefined });
  }

  async setRole(uid: string, role: string): Promise<void> {
    await this.ensureTables();
    await this.sql`UPDATE _icore_users SET role = ${role} WHERE id = ${uid}`;
  }

  async getRole(uid: string): Promise<string | null> {
    await this.ensureTables();
    const rows = await this.sql<{ role: string | null }[]>`
      SELECT role FROM _icore_users WHERE id = ${uid}
    `;
    return rows[0]?.role ?? null;
  }

  async sendMagicLink(_req: MagicLinkRequest): Promise<void> {
    throw new Error('not_implemented');
  }

  async verifyMagicLink(_token: string): Promise<AuthSession> {
    throw new Error('not_implemented');
  }

  async startOAuth(_provider: OAuthProvider, _callbackUrl: string): Promise<OAuthStartResult> {
    throw new Error('not_implemented');
  }

  async completeOAuth(
    _provider: OAuthProvider,
    _code: string,
    _state: string,
  ): Promise<AuthSession> {
    throw new Error('not_implemented');
  }

  private async createSession(user: {
    id: string;
    email: string;
    role?: string;
  }): Promise<AuthSession> {
    const expiresIn = this.opts.jwtExpiresIn ?? '15m';
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.opts.jwtSecret,
      { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] },
    );
    const refreshToken = randomUUID();
    const refreshMs = parseDurationMs(this.opts.refreshExpiresIn ?? '7d');
    const expiresAt = new Date(Date.now() + refreshMs);
    await this.sql`
      INSERT INTO _icore_sessions (id, user_id, refresh_token, expires_at)
      VALUES (${randomUUID()}, ${user.id}, ${refreshToken}, ${expiresAt})
    `;
    return {
      accessToken,
      refreshToken,
      expiresIn: parseDurationSeconds(expiresIn),
      user: { id: user.id, email: user.email },
    };
  }

  async end(): Promise<void> {
    await this.sql.end();
  }
}
```

- [ ] **Step 6: Create `libs/auth-strategies/postgres/src/index.ts`** (strategy + mock only; module added in Task 3)

```typescript
export * from './lib/postgres-auth.strategy';
export * from './lib/testing/mock-postgres-auth';
```

- [ ] **Step 7: Run tests to verify strategy compiles and contract passes**

```bash
yarn nx test auth-postgres
```

Expected: all contract cases pass.

- [ ] **Step 8: Prettier + lint**

```bash
npx prettier --write \
  libs/auth-strategies/postgres/src/index.ts \
  libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts \
  libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts \
  libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.contract.unit.test.ts
yarn nx lint auth-postgres
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add libs/auth-strategies/postgres/src/
git commit -m "feat(auth-postgres): add PostgresAuthStrategy with postgres.js + bcrypt + JWT, in-memory mock, contract tests"
```

---

### Task 3: PostgresAuthModule + module unit tests

**Files:**

- Create: `libs/auth-strategies/postgres/src/lib/postgres-auth.module.ts`
- Create: `libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.module.unit.test.ts`
- Modify: `libs/auth-strategies/postgres/src/index.ts` — add module export

**Interfaces:**

- Consumes: `PostgresAuthStrategy` from Task 2; `buildStrategyWithFallback`, `FakeAuthStrategy` from `@icore/shared`
- Produces: `PostgresAuthModule` class, `POSTGRES_AUTH_REQUIRED_ENV` constant

- [ ] **Step 1: Write the failing module test**

Create `libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.module.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PostgresAuthModule, POSTGRES_AUTH_REQUIRED_ENV } from '../postgres-auth.module.js';
import { PostgresAuthStrategy } from '../postgres-auth.strategy.js';

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

describe('PostgresAuthModule', () => {
  it('declares its required env', () => {
    expect(POSTGRES_AUTH_REQUIRED_ENV).toEqual(['POSTGRES_URL', 'JWT_SECRET']);
  });

  it('provides a real PostgresAuthStrategy under AuthStrategy when env present', async () => {
    ENV = {
      POSTGRES_URL: 'postgresql://user:pass@localhost:5432/test',
      JWT_SECRET: 'test-secret',
    };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, PostgresAuthModule.forRoot('.env')],
    }).compile();
    expect(ref.get('AuthStrategy')).toBeInstanceOf(PostgresAuthStrategy);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
yarn nx test auth-postgres
```

Expected: FAIL — `PostgresAuthModule` not found.

- [ ] **Step 3: Create `libs/auth-strategies/postgres/src/lib/postgres-auth.module.ts`**

```typescript
import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildStrategyWithFallback, FakeAuthStrategy } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { PostgresAuthStrategy } from './postgres-auth.strategy';

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
                  url: cfg.getOrThrow<string>('POSTGRES_URL'),
                  jwtSecret: cfg.getOrThrow<string>('JWT_SECRET'),
                  jwtExpiresIn: cfg.get<string>('JWT_EXPIRES_IN'),
                  refreshExpiresIn: cfg.get<string>('JWT_REFRESH_EXPIRES_IN'),
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

- [ ] **Step 4: Update `libs/auth-strategies/postgres/src/index.ts`**

```typescript
export * from './lib/postgres-auth.strategy';
export * from './lib/postgres-auth.module';
export * from './lib/testing/mock-postgres-auth';
```

- [ ] **Step 5: Run tests to verify all pass**

```bash
yarn nx test auth-postgres
```

Expected: all contract + module tests pass.

- [ ] **Step 6: Run build**

```bash
yarn nx build auth-postgres
```

Expected: green.

- [ ] **Step 7: Prettier + lint**

```bash
npx prettier --write \
  libs/auth-strategies/postgres/src/index.ts \
  libs/auth-strategies/postgres/src/lib/postgres-auth.module.ts \
  libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.module.unit.test.ts
yarn nx lint auth-postgres
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add libs/auth-strategies/postgres/src/
git commit -m "feat(auth-postgres): add PostgresAuthModule with buildStrategyWithFallback, module unit tests"
```

---

### Task 4: Blueprint + CLI wiring (options, prompts, manifest, tests, CI matrix)

**Files:**

- Create: `tools/create-icore/templates/libs/auth-strategies/postgres/` (mirror of lib — 13 files; `git add -f` required)
- Modify: `tools/create-icore/src/lib/options.ts`
- Modify: `tools/create-icore/src/lib/prompts.ts`
- Modify: `tools/create-icore/src/manifest/index.ts`
- Modify: `tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts`
- Modify: `.github/workflows/pipeline.yml`

**Interfaces:**

- Consumes: `PostgresAuthModule`, `PostgresAuthStrategy`, `createMockPostgresAuth` from Tasks 2-3
- Produces: `--auth=postgres` selectable in CLI; CI smoke combo `postgres-auth`

- [ ] **Step 1: Add `'postgres'` to `AuthBackend` in `tools/create-icore/src/lib/options.ts`**

Current line 1:

```typescript
export type AuthBackend = 'supabase' | 'firebase' | 'mongodb';
```

Replace with:

```typescript
export type AuthBackend = 'supabase' | 'firebase' | 'mongodb' | 'postgres';
```

- [ ] **Step 2: Add postgres option to `tools/create-icore/src/lib/prompts.ts`**

Find the auth prompt options block (around line 164-167):

```typescript
{ value: 'supabase', label: 'Supabase' },
{ value: 'firebase', label: 'Firebase' },
{ value: 'mongodb', label: 'MongoDB (Custom Auth)' },
{ value: 'none', label: 'None — no login, open API (simple SPA)' },
```

Replace with:

```typescript
{ value: 'supabase', label: 'Supabase' },
{ value: 'firebase', label: 'Firebase' },
{ value: 'mongodb', label: 'MongoDB (Custom Auth)' },
{ value: 'postgres', label: 'PostgreSQL (direct, postgres.js + bcrypt + JWT)' },
{ value: 'none', label: 'None — no login, open API (simple SPA)' },
```

- [ ] **Step 3: Add `auth.postgres` entry to `tools/create-icore/src/manifest/index.ts`**

Find the `mongodb` entry inside `auth:`:

```typescript
    mongodb: {
      libDirs: ['libs/auth-strategies/mongodb'],
      deps: { mongoose: '^9.6.3' },
      tsPaths: { '@icore/auth-mongodb': ['libs/auth-strategies/mongodb/src/index.ts'] },
      nestModule: { importFrom: '@icore/auth-mongodb', symbol: 'MongoDbAuthModule', into: 'auth' },
    },
```

Add after it:

```typescript
    postgres: {
      libDirs: ['libs/auth-strategies/postgres'],
      deps: { postgres: '^3', bcrypt: '^6', jsonwebtoken: '^9' },
      tsPaths: { '@icore/auth-postgres': ['libs/auth-strategies/postgres/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/auth-postgres',
        symbol: 'PostgresAuthModule',
        into: 'auth',
      },
    },
```

- [ ] **Step 4: Update `tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts`**

**4a.** In the `fixture()` function, extend the lib-dirs loop to include `'postgres'`:

```typescript
for (const p of ['supabase', 'firebase', 'mongodb', 'postgres']) {
  await mkdir(join(dir, `libs/auth-strategies/${p}/src`), { recursive: true });
  await writeFile(join(dir, `libs/auth-strategies/${p}/src/index.ts`), 'export {};');
}
```

**4b.** In the auth `package.json` fixture, add postgres workspace dep and its raw deps:

```typescript
await writeFile(
  join(dir, 'apps/microservices/auth/package.json'),
  JSON.stringify({
    name: 'auth',
    dependencies: {
      '@icore/auth-supabase': '*',
      '@icore/auth-firebase': '*',
      '@icore/auth-mongodb': '*',
      '@icore/auth-postgres': '*',
      '@supabase/supabase-js': '^2.106.2',
      postgres: '^3',
      bcrypt: '^6',
      jsonwebtoken: '^9',
    },
  }),
);
```

**4c.** In the tsconfig paths fixture, add `@icore/auth-postgres`:

```typescript
await writeFile(
  join(dir, 'tsconfig.base.json'),
  JSON.stringify({
    compilerOptions: {
      paths: {
        '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'],
        '@icore/auth-firebase': ['libs/auth-strategies/firebase/src/index.ts'],
        '@icore/auth-mongodb': ['libs/auth-strategies/mongodb/src/index.ts'],
        '@icore/auth-postgres': ['libs/auth-strategies/postgres/src/index.ts'],
      },
    },
  }),
);
```

**4d.** Add test for `writeAuthProvider(dir, 'postgres')`:

In the `describe('writeAuthProvider', ...)` block, add:

```typescript
it('writes auth.provider.ts wiring the postgres provider module', async () => {
  const dir = await fixture();
  await writeAuthProvider(dir, 'postgres');
  const src = await readFile(join(dir, 'apps/microservices/auth/src/app/auth.provider.ts'), 'utf8');
  expect(src).toContain("from '@icore/auth-postgres'");
  expect(src).toContain('PostgresAuthModule.forRoot');
  expect(src).not.toContain('SupabaseAuthModule');
});
```

**4e.** In the existing `cleanupUnusedAuth` test for `'supabase'`, add postgres lib assertions:

```typescript
// postgres also removed when supabase chosen
expect(await exists(join(dir, 'libs/auth-strategies/postgres'))).toBe(false);
```

Also update the deps assertion for `cleanupUnusedAuth(dir, 'supabase')` to verify postgres raw deps are removed:

```typescript
expect(pkg.dependencies).toEqual({
  '@icore/auth-supabase': '*',
  '@supabase/supabase-js': '^2.106.2',
});
```

(This should already pass — the cleanup removes all unchosen deps.)

- [ ] **Step 5: Run `create-icore` tests to verify**

```bash
yarn nx test create-icore
```

Expected: all tests pass (count will be +2 from new assertions).

- [ ] **Step 6: Copy lib to blueprint directory**

```bash
cp -r libs/auth-strategies/postgres tools/create-icore/templates/libs/auth-strategies/postgres
```

- [ ] **Step 7: Stage blueprint with `git add -f` (templates/ is gitignored)**

```bash
git add -f tools/create-icore/templates/libs/auth-strategies/postgres/
```

- [ ] **Step 8: Add `postgres-auth` smoke combo to `.github/workflows/pipeline.yml`**

Find the `mongodb-mixed` entry:

```yaml
- name: mongodb-mixed
  flags: --auth=mongodb --db=firebase --upload=cloudinary --payment=none --jobs=none --example=notes --transport=redis
```

Add after it:

```yaml
- name: postgres-auth
  flags: --auth=postgres --db=postgres --upload=supabase --payment=none --jobs=none --example=notes --transport=tcp
```

- [ ] **Step 9: Prettier + lint CLI + build**

```bash
npx prettier --write \
  tools/create-icore/src/lib/options.ts \
  tools/create-icore/src/lib/prompts.ts \
  tools/create-icore/src/manifest/index.ts \
  tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts \
  .github/workflows/pipeline.yml
yarn nx lint create-icore
yarn nx build create-icore
```

Expected: 0 lint errors, green build.

- [ ] **Step 10: Commit**

```bash
git add \
  tools/create-icore/src/lib/options.ts \
  tools/create-icore/src/lib/prompts.ts \
  tools/create-icore/src/manifest/index.ts \
  tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts \
  .github/workflows/pipeline.yml
git add -f tools/create-icore/templates/libs/auth-strategies/postgres/
git commit -m "feat(create-icore): add postgres AuthProvider option, manifest entry, blueprint, CI smoke combo"
```

---

### Task 5: Docs + changeset

**Files:**

- Create: `.changeset/postgres-auth-strategy.md`
- Modify: `AGENTS.md` — update PostgreSQL provider section

**Interfaces:**

- Produces: changeset for release pipeline; updated AGENTS.md docs

- [ ] **Step 1: Create changeset**

Create `.changeset/postgres-auth-strategy.md`:

```markdown
---
'@idevconn/create-icore': minor
---

Add PostgreSQL auth strategy (@icore/auth-postgres): bcrypt + JWT, users and sessions stored in auto-created \_icore_users / \_icore_sessions tables, selectable via --auth=postgres
```

- [ ] **Step 2: Update `AGENTS.md` PostgreSQL section**

Find the existing `### PostgreSQL (db only)` section and replace it with:

```markdown
### PostgreSQL (db + auth)

**Env vars (db strategy):**
```

DB_PROVIDER=postgres
POSTGRES_URL=postgresql://user:pass@host:5432/dbname

```

**Env vars (auth strategy):**

```

AUTH_PROVIDER=postgres
POSTGRES_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-secret
JWT_EXPIRES_IN=15m # optional, default 15m
JWT_REFRESH_EXPIRES_IN=7d # optional, default 7d

````

**Setup:**

1. Any PostgreSQL >= 14 instance works: Docker (`docker-compose up postgres`), Neon, Railway, AWS RDS, self-hosted.
2. No schema setup required — tables auto-created on first write per collection (db) or first auth call (auth).
3. Auth tables: `_icore_users`, `_icore_sessions` (prefixed to avoid conflict with your schema).
4. `last_logged_in` column on `_icore_users` updated on every `signIn` and `refresh`.

**Schema (db):** Each collection maps to one table: `id TEXT PRIMARY KEY, data JSONB NOT NULL`.

**Schema (auth):**
```sql
_icore_users  (id, email, password_hash, role, last_logged_in, created_at)
_icore_sessions (id, user_id, refresh_token, expires_at)
````

**Note:** `POSTGRES_URL` must include credentials. For SSL, append `?sslmode=require` to the URL. Both `--auth=postgres` and `--db=postgres` use the same `POSTGRES_URL` — single instance covers both.

````

- [ ] **Step 3: Prettier**

```bash
npx prettier --write .changeset/postgres-auth-strategy.md AGENTS.md
````

- [ ] **Step 4: Commit**

```bash
git add .changeset/postgres-auth-strategy.md AGENTS.md
git commit -m "docs: add postgres auth strategy changeset and AGENTS.md docs"
```

- [ ] **Step 5: Push + open PR to dev**

```bash
git push -u origin feature/postgres-auth-strategy
gh pr create --base dev \
  --title "feat(auth-postgres): add standalone PostgreSQL auth strategy" \
  --body "$(cat <<'EOF'
## Summary

- New lib \`@icore/auth-postgres\` — bcrypt + JWT, users/sessions in \`_icore_users\` / \`_icore_sessions\` tables (auto-created)
- \`create-icore\` CLI: \`--auth=postgres\` option wired into manifest, prompts, blueprint
- \`last_logged_in\` tracked per user on every signIn/refresh
- CI: \`postgres-auth\` scaffold smoke combo added
- Single Postgres instance covers both \`--auth=postgres --db=postgres\`

## Test plan

- [ ] \`nx test auth-postgres\` — all contract + module tests pass
- [ ] \`nx build auth-postgres\` — green
- [ ] \`nx lint auth-postgres\` — 0 errors
- [ ] \`nx test create-icore\` — all tests pass
- [ ] CI scaffold smoke \`postgres-auth\` green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
