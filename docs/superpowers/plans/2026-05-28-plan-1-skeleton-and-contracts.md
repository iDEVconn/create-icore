# Plan 1: Workspace Skeleton + Shared Contracts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the icore Nx workspace (yarn 4 PnP) with a shared library that exports the `AuthStrategy` / `StorageStrategy` contracts, a CASL ability factory, a transport helper, and a contract-test harness validated against in-memory fake strategies. After this plan, follow-up plans can drop new strategy libs in without touching the foundation.

**Architecture:** Single Nx workspace seeded with `libs/shared` only. Strategy interfaces live in `libs/shared/src/strategies/`. The contract-test harness is a re-runnable Vitest suite (`runAuthContract(factory)` / `runStorageContract(factory)`) consumed by every concrete strategy in later plans. Fake in-memory strategies live in `libs/shared/src/strategies/fakes/` and serve as both the contract suite's reference implementation and the future E2E test double for the gateway/MS smoke tests.

**Tech Stack:** Nx 22.7, yarn 4 (PnP), TypeScript 5.x strict, Vitest, ESLint 9 flat config, Prettier 3, `@casl/ability`, `@nestjs/microservices` (transport enum only — no runtime Nest in `libs/shared`).

**Source spec:** `docs/superpowers/specs/2026-05-28-icore-design.md`

**Branch:** `dev` (already created; `main` holds the seed commit `a6c8ae3`)

---

## File Map

| Path                                                                      | Purpose                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `package.json`                                                            | Root workspace; yarn 4 PnP, Nx scripts                            |
| `.yarnrc.yml`                                                             | `nodeLinker: pnp`, yarn 4 settings                                |
| `nx.json`                                                                 | Nx config (target defaults, named inputs)                         |
| `tsconfig.base.json`                                                      | Path aliases for `@icore/shared`                                  |
| `eslint.config.mjs`                                                       | Flat ESLint config                                                |
| `.prettierrc`                                                             | Prettier config                                                   |
| `.prettierignore`                                                         | Skip dist, .yarn, node_modules                                    |
| `.gitignore`                                                              | Standard Node + Nx + yarn-PnP entries                             |
| `.nvmrc`                                                                  | Node 22                                                           |
| `.githooks/pre-commit`                                                    | prettier + nx affected lint                                       |
| `jest.preset.cjs`                                                         | Empty stub for future API/MS apps                                 |
| `libs/shared/package.json`                                                | Package manifest, name `@icore/shared`                            |
| `libs/shared/project.json`                                                | Nx project config; `test`, `lint`, `build` targets                |
| `libs/shared/tsconfig.json`                                               | References lib + spec                                             |
| `libs/shared/tsconfig.lib.json`                                           | Lib build config                                                  |
| `libs/shared/tsconfig.spec.json`                                          | Vitest TS config                                                  |
| `libs/shared/vitest.config.ts`                                            | Vitest config (jsdom off, node)                                   |
| `libs/shared/src/index.ts`                                                | Barrel: abilities, strategies, transport                          |
| `libs/shared/src/abilities/subjects.ts`                                   | `AbilityAction`, `AbilitySubject` unions                          |
| `libs/shared/src/abilities/ability.ts`                                    | `defineAbilitiesFor`, `emptyAbility`, `AbilityUser`, `AppAbility` |
| `libs/shared/src/abilities/index.ts`                                      | Barrel                                                            |
| `libs/shared/src/abilities/__tests__/ability.unit.test.ts`                | CASL behaviour tests                                              |
| `libs/shared/src/strategies/auth.ts`                                      | `AuthStrategy`, `AuthSession` types                               |
| `libs/shared/src/strategies/storage.ts`                                   | `StorageStrategy`, `StorageRef`, `FileInput` types                |
| `libs/shared/src/strategies/index.ts`                                     | Barrel                                                            |
| `libs/shared/src/strategies/fakes/fake-auth.ts`                           | `FakeAuthStrategy` (in-memory)                                    |
| `libs/shared/src/strategies/fakes/fake-storage.ts`                        | `FakeStorageStrategy` (in-memory)                                 |
| `libs/shared/src/strategies/fakes/index.ts`                               | Barrel for tests/E2E                                              |
| `libs/shared/src/strategies/contract/auth-contract.ts`                    | `runAuthContract(factory)`                                        |
| `libs/shared/src/strategies/contract/storage-contract.ts`                 | `runStorageContract(factory)`                                     |
| `libs/shared/src/strategies/__tests__/fake-auth.contract.unit.test.ts`    | Validate fake against contract                                    |
| `libs/shared/src/strategies/__tests__/fake-storage.contract.unit.test.ts` | Validate fake against contract                                    |
| `libs/shared/src/transport.ts`                                            | `buildTransport(prefix)` helper                                   |
| `libs/shared/src/__tests__/transport.unit.test.ts`                        | Transport selection tests                                         |
| `docs/architecture.md`                                                    | Architecture overview stub                                        |

---

## Task 1: Initialise Nx workspace with yarn 4 PnP

**Files:**

- Create: `package.json`
- Create: `.yarnrc.yml`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `nx.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Enable corepack and pin yarn 4**

Run:

```bash
corepack enable
corepack prepare yarn@4.5.0 --activate
```

Expected: `yarn --version` prints `4.5.0`.

- [ ] **Step 2: Create root `package.json`**

Write `package.json`:

```json
{
  "name": "icore",
  "version": "0.1.0",
  "private": true,
  "packageManager": "yarn@4.5.0",
  "workspaces": [
    "apps/*",
    "libs/*",
    "libs/auth-strategies/*",
    "libs/storage-strategies/*",
    "tools/*"
  ],
  "scripts": {
    "build": "nx run-many -t build",
    "lint": "nx run-many -t lint",
    "test": "nx run-many -t test",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,md,json}\"",
    "prepare": "git config core.hooksPath .githooks || true"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "eslint": "^9.39.0",
    "nx": "22.7.2",
    "prettier": "^3.4.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.19.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Create `.yarnrc.yml`**

Write `.yarnrc.yml`:

```yaml
nodeLinker: pnp
enableGlobalCache: true
```

- [ ] **Step 4: Create `.nvmrc`**

Write `.nvmrc`:

```
22
```

- [ ] **Step 5: Create `.gitignore`**

Write `.gitignore`:

```
node_modules
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions
.pnp.*
dist
tmp
.nx/cache
.nx/workspace-data
coverage
*.log
.env
.env.local
.DS_Store
```

- [ ] **Step 6: Create `nx.json`**

Write `nx.json`:

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "defaultBase": "dev",
  "neverConnectToCloud": true,
  "analytics": false,
  "targetDefaults": {
    "build": { "dependsOn": ["^build"], "cache": true },
    "lint": { "cache": true },
    "test": { "cache": true }
  },
  "namedInputs": {
    "default": ["{projectRoot}/**/*"],
    "production": ["default", "!{projectRoot}/**/__tests__/**", "!{projectRoot}/**/*.test.ts"]
  }
}
```

- [ ] **Step 7: Create `tsconfig.base.json`**

Write `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@icore/shared": ["libs/shared/src/index.ts"],
      "@icore/shared/*": ["libs/shared/src/*"]
    }
  },
  "exclude": ["node_modules", "dist", ".nx"]
}
```

- [ ] **Step 8: Install + verify**

Run:

```bash
yarn install
yarn nx --version
```

Expected: install completes, `nx` prints `22.7.2`.

- [ ] **Step 9: Commit**

```bash
git add package.json .yarnrc.yml .nvmrc .gitignore nx.json tsconfig.base.json yarn.lock .yarn .pnp.* 2>/dev/null
git commit -m "chore: init Nx workspace with yarn 4 PnP"
```

---

## Task 2: Tooling — Prettier, ESLint, husky + lint-staged

**Why husky (not raw `.githooks/`):** husky 9 mirrors the proven setup in `ui-main`. It plants hooks into `.husky/` and wires `core.hooksPath` automatically on `yarn install` via the `prepare` script. lint-staged runs prettier + eslint only on staged files, which keeps pre-commit fast as the repo grows.

**Files:**

- Create: `.prettierrc`
- Create: `.prettierignore`
- Create: `eslint.config.mjs`
- Create: `.husky/pre-commit`
- Modify: `package.json` (add `prepare: husky`, lint-staged config, husky + lint-staged + ESLint deps)
- Create: `jest.preset.cjs`

- [ ] **Step 1: Create `.prettierrc`**

Write `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

- [ ] **Step 2: Create `.prettierignore`**

Write `.prettierignore`:

```
node_modules
.yarn
.pnp.*
dist
.nx
coverage
yarn.lock
```

- [ ] **Step 3: Create `eslint.config.mjs`**

Write `eslint.config.mjs`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist', '.nx', 'node_modules', '.yarn', '.pnp.*', 'coverage'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
```

- [ ] **Step 4: Install tooling deps**

Run:

```bash
yarn add -D @eslint/js typescript-eslint husky lint-staged
```

Expected: install completes.

- [ ] **Step 5: Swap `prepare` script + add lint-staged config to `package.json`**

Edit `package.json`:

- Change `"prepare": "git config core.hooksPath .githooks || true"` to `"prepare": "husky"`.
- After the closing `}` of `devDependencies`, add a top-level `lint-staged` block:

```json
"lint-staged": {
  "*.{json,md}": ["prettier --write"],
  "*.{js,ts,jsx,tsx}": ["prettier --write", "eslint --cache --fix"]
}
```

- [ ] **Step 6: Initialise husky**

Run:

```bash
yarn husky init
```

This creates `.husky/pre-commit` (a starter that just runs `npm test`) and sets `core.hooksPath` to `.husky/`. Confirm with `git config --get core.hooksPath` → `.husky`.

- [ ] **Step 7: Overwrite `.husky/pre-commit`**

Replace the contents of `.husky/pre-commit` with the icore version (modelled on `ui-main/.husky/pre-commit`, scoped to what exists today — `nx affected` instead of a hardcoded project list because no projects exist yet):

```bash
#!/usr/bin/env bash

MAX_FILES=50
DASHES="--------------------------------------------------------"

echo_print() {
  local message="$1"
  local color="${2:-\033[0m}"
  printf "%s\n" "$DASHES"
  printf "%b\n" "${color}${message}\033[0m"
  printf "%s\n" "$DASHES"
}

check_command() {
  local command="$1"
  local success_message="$2"
  local failure_message="$3"

  if eval "$command"; then
    echo_print "✅ $success_message" "\033[32m"
  else
    echo_print "❌ $failure_message" "\033[31m"
    exit 1
  fi
}

FILES_CHANGED=$(git diff --cached --name-only | wc -l)
NON_MD_FILES=$(git diff --cached --name-only | grep -vi '\.md$' | wc -l)

if [ "$FILES_CHANGED" -gt 0 ] && [ "$NON_MD_FILES" -eq 0 ]; then
  echo_print "📝 Only Markdown files staged. Skipping lint-staged + nx checks." "\033[34m"
  exit 0
fi

if [ "$FILES_CHANGED" -gt "$MAX_FILES" ]; then
  echo "$DASHES"
  echo "🔹 Max files per commit: $MAX_FILES"
  echo "❌ You are trying to commit more than $MAX_FILES files."
  echo "$DASHES"
  exit 1
fi

echo_print "✅ Files staged: $FILES_CHANGED" "\033[32m"

check_command "yarn lint-staged --concurrent false --relative" \
  "lint-staged passed." \
  "lint-staged failed. Fix the issues before committing."

# Only run nx affected if any Nx project exists. Plan 1 Task 3+ creates libs/shared;
# until then this is a no-op.
if [ -d libs ] || [ -d apps ]; then
  check_command "yarn nx affected -t lint --base=HEAD" \
    "nx affected lint passed." \
    "nx affected lint failed."
  check_command "yarn nx affected -t test --base=HEAD" \
    "nx affected tests passed." \
    "nx affected tests failed."
fi
```

Then make it executable:

```bash
chmod +x .husky/pre-commit
```

- [ ] **Step 8: Stub `jest.preset.cjs`**

Write `jest.preset.cjs`:

```js
module.exports = {};
```

- [ ] **Step 9: Verify prettier + lint baseline**

Run:

```bash
yarn format:check
yarn nx run-many -t lint || true
```

Expected: prettier passes; lint reports "no projects" (no Nx projects exist yet).

- [ ] **Step 10: Smoke-test the hook**

Make a trivial change, stage it, commit it. The hook should run lint-staged and exit cleanly. If it does, undo the trivial commit so it doesn't pollute history:

```bash
echo "" >> .prettierrc.smoke && git add .prettierrc.smoke
git commit -m "chore(test): hook smoke (delete me)" && git reset --hard HEAD~1 && rm -f .prettierrc.smoke
```

If the hook errors out, fix the bug and retry before committing the real Task 2 changes.

- [ ] **Step 11: Commit**

```bash
git add .prettierrc .prettierignore eslint.config.mjs .husky/pre-commit jest.preset.cjs package.json yarn.lock
git commit -m "chore: add prettier, eslint, husky + lint-staged tooling"
```

---

## Task 3: Scaffold `libs/shared`

**Files:**

- Create: `libs/shared/package.json`
- Create: `libs/shared/project.json`
- Create: `libs/shared/tsconfig.json`
- Create: `libs/shared/tsconfig.lib.json`
- Create: `libs/shared/tsconfig.spec.json`
- Create: `libs/shared/vitest.config.ts`
- Create: `libs/shared/src/index.ts`

- [ ] **Step 1: Create lib manifest**

Write `libs/shared/package.json`:

```json
{
  "name": "@icore/shared",
  "version": "0.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "type": "module"
}
```

- [ ] **Step 2: Create Nx project config**

Write `libs/shared/project.json`:

```json
{
  "name": "shared",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/shared/src",
  "projectType": "library",
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint libs/shared/src --max-warnings=0" }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run --config libs/shared/vitest.config.ts" }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": { "command": "tsc -p libs/shared/tsconfig.lib.json" }
    }
  }
}
```

- [ ] **Step 3: Create tsconfig files**

Write `libs/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "references": [{ "path": "./tsconfig.lib.json" }, { "path": "./tsconfig.spec.json" }]
}
```

Write `libs/shared/tsconfig.lib.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../dist/libs/shared",
    "declaration": true,
    "composite": true,
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/__tests__/**", "src/**/*.test.ts"]
}
```

Write `libs/shared/tsconfig.spec.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc/libs/shared-spec",
    "types": ["vitest/globals", "node"]
  },
  "include": ["src/**/__tests__/**/*.ts", "src/**/*.test.ts", "src/**/*.ts"]
}
```

- [ ] **Step 4: Create Vitest config**

Write `libs/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.unit.test.ts'],
  },
});
```

- [ ] **Step 5: Create empty barrel**

Write `libs/shared/src/index.ts`:

```ts
export {};
```

- [ ] **Step 6: Sanity check**

Run:

```bash
yarn nx test shared
```

Expected: Vitest runs, no test files, exit 0.

- [ ] **Step 7: Commit**

```bash
git add libs/shared
git commit -m "feat(shared): scaffold libs/shared lib with vitest, eslint, tsc targets"
```

---

## Task 4: CASL ability — RED then GREEN

**Files:**

- Create: `libs/shared/src/abilities/subjects.ts`
- Create: `libs/shared/src/abilities/__tests__/ability.unit.test.ts`
- Create: `libs/shared/src/abilities/ability.ts`
- Create: `libs/shared/src/abilities/index.ts`
- Modify: `libs/shared/src/index.ts`

- [ ] **Step 1: Define subject/action unions (no behaviour yet)**

Write `libs/shared/src/abilities/subjects.ts`:

```ts
export type AbilityAction = 'manage' | 'create' | 'read' | 'update' | 'delete';
export type AbilitySubject = 'all' | 'User' | 'Profile';
```

- [ ] **Step 2: Install CASL**

Run:

```bash
yarn add @casl/ability
```

- [ ] **Step 3: Write the failing test**

Write `libs/shared/src/abilities/__tests__/ability.unit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defineAbilitiesFor, emptyAbility } from '../ability';

describe('defineAbilitiesFor', () => {
  it('grants admin manage on all', () => {
    const ability = defineAbilitiesFor({ id: 'u1', role: 'admin' });
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(true);
  });

  it('denies regular user by default', () => {
    const ability = defineAbilitiesFor({ id: 'u2', role: 'user' });
    expect(ability.can('manage', 'all')).toBe(false);
    expect(ability.can('read', 'User')).toBe(false);
  });

  it('denies everything for null user', () => {
    const ability = defineAbilitiesFor(null);
    expect(ability.can('read', 'Profile')).toBe(false);
  });
});

describe('emptyAbility', () => {
  it('denies everything', () => {
    const ability = emptyAbility();
    expect(ability.can('manage', 'all')).toBe(false);
  });
});
```

- [ ] **Step 4: Run test — expect failure**

Run:

```bash
yarn nx test shared
```

Expected: FAIL — `Cannot find module '../ability'`.

- [ ] **Step 5: Write minimal implementation**

Write `libs/shared/src/abilities/ability.ts`:

```ts
import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { AbilityAction, AbilitySubject } from './subjects';

export type AppAbility = MongoAbility<[AbilityAction, AbilitySubject]>;

export interface AbilityUser {
  id: string;
  role: 'admin' | 'user';
}

export function defineAbilitiesFor(user: AbilityUser | null): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  if (user?.role === 'admin') {
    can('manage', 'all');
  }
  return build();
}

export function emptyAbility(): AppAbility {
  return createMongoAbility<[AbilityAction, AbilitySubject]>([]);
}
```

Write `libs/shared/src/abilities/index.ts`:

```ts
export * from './ability';
export * from './subjects';
```

- [ ] **Step 6: Run test — expect pass**

Run:

```bash
yarn nx test shared
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Wire into root barrel**

Edit `libs/shared/src/index.ts`:

```ts
export * from './abilities';
```

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/abilities libs/shared/src/index.ts package.json yarn.lock
git commit -m "feat(shared): add CASL defineAbilitiesFor with admin/user/null cases"
```

---

## Task 5: AuthStrategy contract type

**Files:**

- Create: `libs/shared/src/strategies/auth.ts`
- Create: `libs/shared/src/strategies/index.ts`
- Modify: `libs/shared/src/index.ts`

- [ ] **Step 1: Write the interface**

Write `libs/shared/src/strategies/auth.ts`:

```ts
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string };
}

export interface VerifiedToken {
  uid: string;
  email?: string;
  role?: string;
}

export interface AuthStrategy {
  verifyToken(token: string): Promise<VerifiedToken>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  setRole(uid: string, role: string): Promise<void>;
}
```

- [ ] **Step 2: Create strategies barrel**

Write `libs/shared/src/strategies/index.ts`:

```ts
export * from './auth';
```

- [ ] **Step 3: Wire into root barrel**

Edit `libs/shared/src/index.ts`:

```ts
export * from './abilities';
export * from './strategies';
```

- [ ] **Step 4: Verify typecheck**

Run:

```bash
yarn nx build shared
```

Expected: tsc succeeds.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/strategies/auth.ts libs/shared/src/strategies/index.ts libs/shared/src/index.ts
git commit -m "feat(shared): add AuthStrategy interface and AuthSession type"
```

---

## Task 6: StorageStrategy contract type

**Files:**

- Create: `libs/shared/src/strategies/storage.ts`
- Modify: `libs/shared/src/strategies/index.ts`

- [ ] **Step 1: Write the interface**

Write `libs/shared/src/strategies/storage.ts`:

```ts
export interface StorageRef {
  bucket: string;
  path: string;
}

export interface FileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface StorageStrategy {
  upload(userId: string, file: FileInput): Promise<StorageRef>;
  remove(userId: string, ref: StorageRef): Promise<void>;
  getSignedUrl(userId: string, ref: StorageRef, ttlSec?: number): Promise<string>;
  list(userId: string, prefix?: string): Promise<StorageRef[]>;
}
```

- [ ] **Step 2: Add to barrel**

Edit `libs/shared/src/strategies/index.ts`:

```ts
export * from './auth';
export * from './storage';
```

- [ ] **Step 3: Build**

Run:

```bash
yarn nx build shared
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/storage.ts libs/shared/src/strategies/index.ts
git commit -m "feat(shared): add StorageStrategy interface and StorageRef/FileInput types"
```

---

## Task 7: Auth contract harness — RED then GREEN

**Files:**

- Create: `libs/shared/src/strategies/contract/auth-contract.ts`
- Create: `libs/shared/src/strategies/fakes/fake-auth.ts`
- Create: `libs/shared/src/strategies/fakes/index.ts`
- Create: `libs/shared/src/strategies/__tests__/fake-auth.contract.unit.test.ts`
- Modify: `libs/shared/src/strategies/index.ts`

- [ ] **Step 1: Write contract harness (no fakes yet)**

Write `libs/shared/src/strategies/contract/auth-contract.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import type { AuthStrategy } from '../auth';

export function runAuthContract(name: string, factory: () => AuthStrategy): void {
  describe(`AuthStrategy contract: ${name}`, () => {
    let strategy: AuthStrategy;

    beforeEach(() => {
      strategy = factory();
    });

    it('signUp returns a session for new user', async () => {
      const session = await strategy.signUp('a@x.com', 'pw12345!');
      expect(session.accessToken).toBeTruthy();
      expect(session.refreshToken).toBeTruthy();
      expect(session.user.email).toBe('a@x.com');
    });

    it('signIn returns a session after signUp', async () => {
      await strategy.signUp('b@x.com', 'pw12345!');
      const session = await strategy.signIn('b@x.com', 'pw12345!');
      expect(session.user.email).toBe('b@x.com');
    });

    it('verifyToken resolves the uid from a signIn token', async () => {
      const session = await strategy.signUp('c@x.com', 'pw12345!');
      const verified = await strategy.verifyToken(session.accessToken);
      expect(verified.uid).toBe(session.user.id);
    });

    it('verifyToken rejects bogus token', async () => {
      await expect(strategy.verifyToken('not-a-token')).rejects.toThrow();
    });

    it('refresh issues a new session', async () => {
      const first = await strategy.signUp('d@x.com', 'pw12345!');
      const next = await strategy.refresh(first.refreshToken);
      expect(next.user.id).toBe(first.user.id);
    });

    it('setRole writes role visible on verifyToken', async () => {
      const session = await strategy.signUp('e@x.com', 'pw12345!');
      await strategy.setRole(session.user.id, 'admin');
      const reLogged = await strategy.signIn('e@x.com', 'pw12345!');
      const verified = await strategy.verifyToken(reLogged.accessToken);
      expect(verified.role).toBe('admin');
    });
  });
}
```

- [ ] **Step 2: Write fake strategy spec invocation (RED)**

Write `libs/shared/src/strategies/__tests__/fake-auth.contract.unit.test.ts`:

```ts
import { FakeAuthStrategy } from '../fakes/fake-auth';
import { runAuthContract } from '../contract/auth-contract';

runAuthContract('FakeAuthStrategy', () => new FakeAuthStrategy());
```

- [ ] **Step 3: Run — expect failure**

Run:

```bash
yarn nx test shared
```

Expected: FAIL — `Cannot find module '../fakes/fake-auth'`.

- [ ] **Step 4: Implement fake**

Write `libs/shared/src/strategies/fakes/fake-auth.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { AuthSession, AuthStrategy, VerifiedToken } from '../auth';

interface StoredUser {
  id: string;
  email: string;
  password: string;
  role?: string;
}

export class FakeAuthStrategy implements AuthStrategy {
  private readonly users = new Map<string, StoredUser>();
  private readonly tokensToUid = new Map<string, string>();
  private readonly refreshToUid = new Map<string, string>();

  async signUp(email: string, password: string): Promise<AuthSession> {
    if (this.users.has(email)) throw new Error('user_exists');
    const user: StoredUser = { id: randomUUID(), email, password };
    this.users.set(email, user);
    return this.issueSession(user);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const user = this.users.get(email);
    if (!user || user.password !== password) throw new Error('invalid_credentials');
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const uid = this.refreshToUid.get(refreshToken);
    if (!uid) throw new Error('invalid_refresh_token');
    const user = [...this.users.values()].find((u) => u.id === uid);
    if (!user) throw new Error('user_missing');
    return this.issueSession(user);
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const uid = this.tokensToUid.get(token);
    if (!uid) throw new Error('invalid_token');
    const user = [...this.users.values()].find((u) => u.id === uid);
    if (!user) throw new Error('user_missing');
    return { uid: user.id, email: user.email, role: user.role };
  }

  async setRole(uid: string, role: string): Promise<void> {
    const user = [...this.users.values()].find((u) => u.id === uid);
    if (!user) throw new Error('user_missing');
    user.role = role;
  }

  private issueSession(user: StoredUser): AuthSession {
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    this.tokensToUid.set(accessToken, user.id);
    this.refreshToUid.set(refreshToken, user.id);
    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: { id: user.id, email: user.email },
    };
  }
}
```

Write `libs/shared/src/strategies/fakes/index.ts`:

```ts
export * from './fake-auth';
```

- [ ] **Step 5: Export contract + fakes from barrel**

Edit `libs/shared/src/strategies/index.ts`:

```ts
export * from './auth';
export * from './storage';
export * from './contract/auth-contract';
export * from './fakes';
```

- [ ] **Step 6: Run — expect pass**

Run:

```bash
yarn nx test shared
```

Expected: PASS, 6 new tests under `FakeAuthStrategy`.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/strategies/contract libs/shared/src/strategies/fakes libs/shared/src/strategies/__tests__/fake-auth.contract.unit.test.ts libs/shared/src/strategies/index.ts
git commit -m "feat(shared): add AuthStrategy contract harness and in-memory fake"
```

---

## Task 8: Storage contract harness — RED then GREEN

**Files:**

- Create: `libs/shared/src/strategies/contract/storage-contract.ts`
- Create: `libs/shared/src/strategies/fakes/fake-storage.ts`
- Create: `libs/shared/src/strategies/__tests__/fake-storage.contract.unit.test.ts`
- Modify: `libs/shared/src/strategies/fakes/index.ts`
- Modify: `libs/shared/src/strategies/index.ts`

- [ ] **Step 1: Write contract harness**

Write `libs/shared/src/strategies/contract/storage-contract.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import type { FileInput, StorageStrategy } from '../storage';

const fixture = (): FileInput => ({
  buffer: Buffer.from('hello world'),
  filename: 'hello.txt',
  mimeType: 'text/plain',
});

export function runStorageContract(name: string, factory: () => StorageStrategy): void {
  describe(`StorageStrategy contract: ${name}`, () => {
    let strategy: StorageStrategy;

    beforeEach(() => {
      strategy = factory();
    });

    it('upload returns a StorageRef under the user prefix', async () => {
      const ref = await strategy.upload('user-1', fixture());
      expect(ref.path.startsWith('user-1/')).toBe(true);
      expect(ref.bucket).toBeTruthy();
    });

    it('list returns previously uploaded files for the same user', async () => {
      await strategy.upload('user-2', fixture());
      const refs = await strategy.list('user-2');
      expect(refs.length).toBe(1);
    });

    it('list isolates users', async () => {
      await strategy.upload('user-a', fixture());
      expect(await strategy.list('user-b')).toEqual([]);
    });

    it('getSignedUrl returns a non-empty string', async () => {
      const ref = await strategy.upload('user-3', fixture());
      const url = await strategy.getSignedUrl('user-3', ref, 60);
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });

    it('remove deletes the file', async () => {
      const ref = await strategy.upload('user-4', fixture());
      await strategy.remove('user-4', ref);
      expect(await strategy.list('user-4')).toEqual([]);
    });

    it('signed URL for a foreign user throws', async () => {
      const ref = await strategy.upload('owner', fixture());
      await expect(strategy.getSignedUrl('attacker', ref)).rejects.toThrow();
    });
  });
}
```

- [ ] **Step 2: Write fake-storage test (RED)**

Write `libs/shared/src/strategies/__tests__/fake-storage.contract.unit.test.ts`:

```ts
import { FakeStorageStrategy } from '../fakes/fake-storage';
import { runStorageContract } from '../contract/storage-contract';

runStorageContract('FakeStorageStrategy', () => new FakeStorageStrategy());
```

- [ ] **Step 3: Run — expect failure**

Run:

```bash
yarn nx test shared
```

Expected: FAIL — `Cannot find module '../fakes/fake-storage'`.

- [ ] **Step 4: Implement fake**

Write `libs/shared/src/strategies/fakes/fake-storage.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { FileInput, StorageRef, StorageStrategy } from '../storage';

interface StoredFile {
  ownerId: string;
  ref: StorageRef;
  bytes: Buffer;
  mimeType: string;
}

export class FakeStorageStrategy implements StorageStrategy {
  private readonly bucket = 'fake-bucket';
  private readonly files = new Map<string, StoredFile>();

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const path = `${userId}/${randomUUID()}-${file.filename}`;
    const ref: StorageRef = { bucket: this.bucket, path };
    this.files.set(this.key(ref), {
      ownerId: userId,
      ref,
      bytes: file.buffer,
      mimeType: file.mimeType,
    });
    return ref;
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    const file = this.files.get(this.key(ref));
    if (!file) throw new Error('not_found');
    if (file.ownerId !== userId) throw new Error('forbidden');
    this.files.delete(this.key(ref));
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    const file = this.files.get(this.key(ref));
    if (!file) throw new Error('not_found');
    if (file.ownerId !== userId) throw new Error('forbidden');
    return `fake://${ref.bucket}/${ref.path}?ttl=${ttlSec}`;
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    return [...this.files.values()]
      .filter((f) => f.ownerId === userId)
      .filter((f) => (prefix ? f.ref.path.startsWith(prefix) : true))
      .map((f) => f.ref);
  }

  private key(ref: StorageRef): string {
    return `${ref.bucket}::${ref.path}`;
  }
}
```

- [ ] **Step 5: Add to fakes barrel**

Edit `libs/shared/src/strategies/fakes/index.ts`:

```ts
export * from './fake-auth';
export * from './fake-storage';
```

- [ ] **Step 6: Export contract from strategies barrel**

Edit `libs/shared/src/strategies/index.ts`:

```ts
export * from './auth';
export * from './storage';
export * from './contract/auth-contract';
export * from './contract/storage-contract';
export * from './fakes';
```

- [ ] **Step 7: Run — expect pass**

Run:

```bash
yarn nx test shared
```

Expected: PASS, 6 new tests under `FakeStorageStrategy`.

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/strategies/contract/storage-contract.ts libs/shared/src/strategies/fakes/fake-storage.ts libs/shared/src/strategies/fakes/index.ts libs/shared/src/strategies/__tests__/fake-storage.contract.unit.test.ts libs/shared/src/strategies/index.ts
git commit -m "feat(shared): add StorageStrategy contract harness and in-memory fake"
```

---

## Task 9: Transport helper — RED then GREEN

**Files:**

- Create: `libs/shared/src/__tests__/transport.unit.test.ts`
- Create: `libs/shared/src/transport.ts`
- Modify: `libs/shared/src/index.ts`

- [ ] **Step 1: Install `@nestjs/microservices` typings**

Run:

```bash
yarn add @nestjs/microservices
```

Only the `Transport` enum is referenced.

- [ ] **Step 2: Write failing test**

Write `libs/shared/src/__tests__/transport.unit.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Transport } from '@nestjs/microservices';
import { buildTransport } from '../transport';

const ORIG = { ...process.env };

describe('buildTransport', () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) if (k.startsWith('AUTH_')) delete process.env[k];
  });
  afterEach(() => {
    Object.assign(process.env, ORIG);
  });

  it('defaults to TCP', () => {
    process.env.AUTH_HOST = '127.0.0.1';
    process.env.AUTH_PORT = '4001';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.TCP);
    expect((opts.options as { host: string; port: number }).host).toBe('127.0.0.1');
    expect((opts.options as { host: string; port: number }).port).toBe(4001);
  });

  it('selects Redis when AUTH_TRANSPORT=redis', () => {
    process.env.AUTH_TRANSPORT = 'redis';
    process.env.AUTH_REDIS_URL = 'redis://localhost:6379';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.REDIS);
    expect((opts.options as { url: string }).url).toBe('redis://localhost:6379');
  });

  it('selects NATS when AUTH_TRANSPORT=nats', () => {
    process.env.AUTH_TRANSPORT = 'nats';
    process.env.AUTH_NATS_URL = 'nats://localhost:4222,nats://localhost:4223';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.NATS);
    expect((opts.options as { servers: string[] }).servers).toEqual([
      'nats://localhost:4222',
      'nats://localhost:4223',
    ]);
  });

  it('throws on unknown transport', () => {
    process.env.AUTH_TRANSPORT = 'sqs';
    expect(() => buildTransport('AUTH')).toThrow(/sqs/);
  });

  it('throws when required env var is missing', () => {
    process.env.AUTH_TRANSPORT = 'redis';
    expect(() => buildTransport('AUTH')).toThrow(/AUTH_REDIS_URL/);
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run:

```bash
yarn nx test shared
```

Expected: FAIL — module `../transport` not found.

- [ ] **Step 4: Implement helper**

Write `libs/shared/src/transport.ts`:

```ts
import { Transport, type ClientOptions } from '@nestjs/microservices';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function buildTransport(prefix: string): ClientOptions {
  const kind = (process.env[`${prefix}_TRANSPORT`] ?? 'tcp').toLowerCase();
  switch (kind) {
    case 'tcp':
      return {
        transport: Transport.TCP,
        options: {
          host: required(`${prefix}_HOST`),
          port: Number(required(`${prefix}_PORT`)),
        },
      };
    case 'redis':
      return {
        transport: Transport.REDIS,
        options: { url: required(`${prefix}_REDIS_URL`) },
      };
    case 'nats':
      return {
        transport: Transport.NATS,
        options: { servers: required(`${prefix}_NATS_URL`).split(',') },
      };
    default:
      throw new Error(`Unknown transport: ${kind}`);
  }
}
```

- [ ] **Step 5: Export from root barrel**

Edit `libs/shared/src/index.ts`:

```ts
export * from './abilities';
export * from './strategies';
export * from './transport';
```

- [ ] **Step 6: Run — expect pass**

Run:

```bash
yarn nx test shared
```

Expected: PASS, 5 new transport tests.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/transport.ts libs/shared/src/__tests__/transport.unit.test.ts libs/shared/src/index.ts package.json yarn.lock
git commit -m "feat(shared): add buildTransport helper for TCP/Redis/NATS selection"
```

---

## Task 10: Architecture doc stub

**Files:**

- Create: `docs/architecture.md`

- [ ] **Step 1: Write the doc**

Write `docs/architecture.md`:

```markdown
# icore Architecture

This document tracks how the icore pieces fit together. It is updated incrementally as each plan from `docs/superpowers/plans/` lands.

## Status

- ✅ Plan 1 (workspace + shared contracts) — done
- ⬜ Plan 2 (Supabase auth MS + gateway AuthGuard)
- ⬜ Plan 3 (Firebase auth strategy)
- ⬜ Plan 4 (Supabase storage MS + gateway routes)
- ⬜ Plan 5 (Firebase + Cloudinary storage strategies)
- ⬜ Plan 6 (client shell)
- ⬜ Plan 7 (`@idevconn/create-icore` CLI + publish)

## Shared library (`libs/shared`)

- `defineAbilitiesFor` — single source of truth for CASL rules; used by both server (`AbilityGuard`) and client (`<AbilityProvider>`)
- `AuthStrategy` / `StorageStrategy` — provider-agnostic contracts; live in `src/strategies/`
- `runAuthContract` / `runStorageContract` — re-runnable Vitest suites; every concrete strategy lib re-uses them
- `FakeAuthStrategy` / `FakeStorageStrategy` — in-memory implementations used by the contract tests and reserved for the future gateway smoke E2E
- `buildTransport(prefix)` — reads `${prefix}_TRANSPORT` env (`tcp` | `redis` | `nats`) and returns a NestJS `ClientOptions`. Same helper used on gateway client side and inside each MS `main.ts`.

## Conventions

- Tests live in `src/**/__tests__/` next to source.
- One responsibility per file (matches `warranty` AGENTS.md rule).
- Strategies stay free of NestJS runtime imports — DI wiring happens in the apps that consume them.
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: add architecture overview tracking plan progress"
```

---

## Task 11: Final verification + plan-complete commit

**Files:** None (verification only)

- [ ] **Step 1: Run lint across workspace**

Run:

```bash
yarn nx run-many -t lint
```

Expected: PASS.

- [ ] **Step 2: Run tests across workspace**

Run:

```bash
yarn nx run-many -t test
```

Expected: PASS — 4 ability + 6 fake-auth + 6 fake-storage + 5 transport = 21 tests.

- [ ] **Step 3: Run build across workspace**

Run:

```bash
yarn nx run-many -t build
```

Expected: PASS — `libs/shared` tsc emits to `dist/libs/shared`.

- [ ] **Step 4: Format check**

Run:

```bash
yarn format:check
```

Expected: PASS.

- [ ] **Step 5: Confirm branch + log**

Run:

```bash
git status
git log --oneline | head -15
```

Expected: clean tree on `dev`, ~10 commits from this plan.

- [ ] **Step 6: Open PR onto dev (optional — only if remote exists)**

Skip unless `git remote -v` shows an origin. Local-only is fine at this stage.

---

## Self-Review Notes

- **Spec coverage:**
  - Phase 0 (skeleton) → Tasks 1–2 ✅
  - Phase 1 (shared contracts) → Tasks 3–9 ✅
  - Architecture doc seeded → Task 10 ✅
  - Build/lint/test green → Task 11 ✅
- **Strategy contract suite** referenced in spec Section "Testing Strategy" → implemented Task 7+8 ✅
- **Fake strategies for E2E smoke** mentioned in spec → implemented Task 7+8 ✅
- **Transport helper** with env-driven selection → implemented Task 9 ✅
- **`AUTH_TRANSPORT` / `UPLOAD_TRANSPORT` env contract** documented via test cases → Task 9 ✅
- **CASL `defineAbilitiesFor`** → Task 4 ✅
- No placeholders; every code step has full code; every test step has the test body.
- Method/type names consistent: `AuthStrategy` / `StorageStrategy` / `AuthSession` / `StorageRef` / `FileInput` / `runAuthContract` / `runStorageContract` used identically across tasks.

## Out of scope (deferred to later plans)

- `apps/api` gateway, `apps/microservices/{auth,upload}`, concrete provider strategies, client app, CLI, docker-compose, CI workflow — all start in Plan 2 onward.
- No subscriptions / audit / scheduler / webhooks / admin module — explicit Non-Goal in spec.
