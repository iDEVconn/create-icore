# Scaffold Runtime Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs that break a freshly generated project on first `yarn dev`: browser `node:crypto` crash, NestJS crash on empty env vars, and unused strategy libs being built.

**Architecture:** Bug 1 — replace `node:crypto` import with `globalThis.crypto` in shared fakes (one-liner, no API change). Bug 2 — add a `requireEnv` helper in each MS factory that rejects empty strings and names the `.env` file to fix. Bug 3 — three new scaffold functions (`removeUnusedAuthStrategies`, `removeUnusedStorageStrategies`, `removeUnusedDbStrategies`) that delete non-selected strategy libs and strip their imports/factory-functions/switch-cases from the MS module files.

**Tech Stack:** TypeScript, Vitest, NestJS ConfigService, Nx workspace

---

## File Map

| File                                                                     | Change                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `libs/shared/src/strategies/fakes/fake-auth.ts`                          | `node:crypto` → `globalThis.crypto`                  |
| `libs/shared/src/strategies/fakes/fake-storage.ts`                       | same                                                 |
| `apps/microservices/auth/src/app/app.module.ts`                          | add `requireEnv` helper                              |
| `apps/microservices/upload/src/app/app.module.ts`                        | add `requireEnv` helper                              |
| `apps/microservices/notes/src/app/app.module.ts`                         | add `requireEnv` helper                              |
| `tools/create-icore/src/lib/scaffold.ts`                                 | add three removal functions + wire into `scaffold()` |
| `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`             | unit tests for three new functions                   |
| `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts` | integration tests for strategy pruning               |

---

## Task 1: Fix `node:crypto` in shared fakes (Bug 1)

**Files:**

- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts`
- Modify: `libs/shared/src/strategies/fakes/fake-storage.ts`

`globalThis.crypto.randomUUID()` is available in Node 20+ (stable) and all modern browsers. No new tests needed — existing shared tests exercise FakeAuthStrategy and FakeStorageStrategy and will continue to pass.

- [ ] **Step 1: Edit `fake-auth.ts`**

Replace line 1:

```typescript
import { randomUUID } from 'node:crypto';
```

with nothing (remove it entirely). Then replace every `randomUUID()` call with `globalThis.crypto.randomUUID()`. There are 6 occurrences (lines 36, 75, 78, 98, 114, 126, 140, 141 — use replace_all).

After the edit the file must NOT contain `node:crypto` and every id/token/state/code generation must use `globalThis.crypto.randomUUID()`.

- [ ] **Step 2: Edit `fake-storage.ts`**

Same: remove `import { randomUUID } from 'node:crypto';` (line 1), replace `randomUUID()` on line 16 with `globalThis.crypto.randomUUID()`.

- [ ] **Step 3: Run shared tests**

```bash
yarn nx test shared 2>&1 | tail -8
```

Expected: 48/48 pass.

- [ ] **Step 4: Commit**

```bash
npx prettier --write libs/shared/src/strategies/fakes/fake-auth.ts libs/shared/src/strategies/fakes/fake-storage.ts
git add libs/shared/src/strategies/fakes/fake-auth.ts \
        libs/shared/src/strategies/fakes/fake-storage.ts
git commit -m "fix(shared): replace node:crypto with globalThis.crypto in fakes — browser compatible"
```

---

## Task 2: Non-empty env validation in MS factories (Bug 3)

**Files:**

- Modify: `apps/microservices/auth/src/app/app.module.ts`
- Modify: `apps/microservices/upload/src/app/app.module.ts`
- Modify: `apps/microservices/notes/src/app/app.module.ts`

`ConfigService.getOrThrow` throws for `undefined` but silently returns `""` for empty strings. Add a `requireEnv` helper at the top of each module that validates non-empty.

- [ ] **Step 1: Add `requireEnv` to `apps/microservices/auth/src/app/app.module.ts`**

Add this function after the imports, before `function makeFirebaseStrategy`:

```typescript
function requireEnv(cfg: ConfigService, key: string): string {
  const val = cfg.getOrThrow<string>(key);
  if (!val) throw new Error(`${key} is not set — check apps/microservices/auth/.env`);
  return val;
}
```

Replace every `cfg.getOrThrow<string>('KEY')` call inside the factory with `requireEnv(cfg, 'KEY')`. There are 8 occurrences across `makeFirebaseStrategy` and the supabase case:

- `cfg.getOrThrow<string>('FB_ADMIN_PROJECT_ID')` → `requireEnv(cfg, 'FB_ADMIN_PROJECT_ID')`
- `cfg.getOrThrow<string>('FB_ADMIN_CLIENT_EMAIL')` → `requireEnv(cfg, 'FB_ADMIN_CLIENT_EMAIL')`
- `cfg.getOrThrow<string>('FB_ADMIN_PRIVATE_KEY')` → `requireEnv(cfg, 'FB_ADMIN_PRIVATE_KEY')`
- `cfg.getOrThrow<string>('FIREBASE_WEB_API_KEY')` → `requireEnv(cfg, 'FIREBASE_WEB_API_KEY')`
- `cfg.getOrThrow<string>('AUTH_PROVIDER')` → `requireEnv(cfg, 'AUTH_PROVIDER')`
- `cfg.getOrThrow<string>('SUPABASE_URL')` → `requireEnv(cfg, 'SUPABASE_URL')`
- `cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY')` → `requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY')`

- [ ] **Step 2: Add `requireEnv` to `apps/microservices/upload/src/app/app.module.ts`**

Same helper (change the `.env` path in the error message to `apps/microservices/upload/.env`):

```typescript
function requireEnv(cfg: ConfigService, key: string): string {
  const val = cfg.getOrThrow<string>(key);
  if (!val) throw new Error(`${key} is not set — check apps/microservices/upload/.env`);
  return val;
}
```

Replace all `cfg.getOrThrow<string>('...')` calls in `makeFirebaseStorage`, `makeCloudinaryStorage`, and the `useFactory` with `requireEnv(cfg, '...')`. Occurrences: `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `FIREBASE_STORAGE_BUCKET`, `FB_ADMIN_PROJECT_ID`, `FB_ADMIN_CLIENT_EMAIL`, `FB_ADMIN_PRIVATE_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

Leave `cfg.get<string>('CLOUDINARY_BUCKET_TAG')` as-is (it's optional with a default).

- [ ] **Step 3: Add `requireEnv` to `apps/microservices/notes/src/app/app.module.ts`**

Same helper (`apps/microservices/notes/.env`):

```typescript
function requireEnv(cfg: ConfigService, key: string): string {
  const val = cfg.getOrThrow<string>(key);
  if (!val) throw new Error(`${key} is not set — check apps/microservices/notes/.env`);
  return val;
}
```

Replace: `DB_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FB_ADMIN_PROJECT_ID`, `FB_ADMIN_CLIENT_EMAIL`, `FB_ADMIN_PRIVATE_KEY`.

- [ ] **Step 4: Run lint + build for affected MSes**

```bash
yarn nx run-many -t lint --projects=auth,upload,notes 2>&1 | tail -5
yarn nx run auth:build upload:build notes:build 2>&1 | tail -5
```

Expected: lint clean, builds pass.

- [ ] **Step 5: Commit**

```bash
npx prettier --write \
  apps/microservices/auth/src/app/app.module.ts \
  apps/microservices/upload/src/app/app.module.ts \
  apps/microservices/notes/src/app/app.module.ts
git add apps/microservices/auth/src/app/app.module.ts \
        apps/microservices/upload/src/app/app.module.ts \
        apps/microservices/notes/src/app/app.module.ts
git commit -m "fix(ms): requireEnv validates non-empty env vars — clear error instead of cryptic crash"
```

---

## Task 3: Prune unused strategy libs in scaffold (Bug 2)

**Files:**

- Modify: `tools/create-icore/src/lib/scaffold.ts`
- Test: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`
- Test: `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts`

Three new functions in `scaffold.ts` that delete non-selected strategy libs and clean their imports/factory-functions/switch-cases from the MS app.module.ts files.

### Step 1: Write failing unit tests

Read the existing unit test file first to understand the structure. Add these describes after the `removeNotesStack` block:

```typescript
describe('removeUnusedAuthStrategies', () => {
  it('auth=supabase removes firebase lib and strips its import/function/case from auth module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-auth-'));

    await mkdir(join(dir, 'libs/auth-strategies/firebase/src'), { recursive: true });
    await writeFile(join(dir, 'libs/auth-strategies/firebase/src/index.ts'), 'export {};');
    await mkdir(join(dir, 'libs/auth-strategies/supabase/src'), { recursive: true });
    await writeFile(join(dir, 'libs/auth-strategies/supabase/src/index.ts'), 'export {};');
    await mkdir(join(dir, 'apps/microservices/auth/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/src/app/app.module.ts'),
      `import * as admin from 'firebase-admin';\nimport { FirebaseAuthStrategy } from '@icore/auth-firebase';\nimport { SupabaseAuthStrategy } from '@icore/auth-supabase';\nfunction makeFirebaseStrategy() { return admin.app(); }\ncase 'firebase': return makeFirebaseStrategy();\ncase 'supabase': return new SupabaseAuthStrategy();`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/auth-supabase":["./libs/auth-strategies/supabase/src/index.ts"],"@icore/auth-firebase":["./libs/auth-strategies/firebase/src/index.ts"]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/auth'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/package.json'),
      JSON.stringify(
        {
          name: 'auth',
          dependencies: { '@icore/auth-supabase': '*', '@icore/auth-firebase': '*' },
        },
        null,
        2,
      ),
    );

    await removeUnusedAuthStrategies(dir, 'supabase');

    await expect(access(join(dir, 'libs/auth-strategies/firebase'))).rejects.toThrow();
    const mod = await readFile(join(dir, 'apps/microservices/auth/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/auth-firebase');
    expect(mod).not.toContain('firebase-admin');
    expect(mod).not.toContain('makeFirebaseStrategy');
    expect(mod).toContain('SupabaseAuthStrategy');
    const tsconfig = await readFile(join(dir, 'tsconfig.base.json'), 'utf8');
    expect(tsconfig).not.toContain('@icore/auth-firebase');
    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/auth/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).not.toHaveProperty('@icore/auth-firebase');
  });

  it('auth=firebase removes supabase lib and strips its import/case from auth module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-auth-'));

    await mkdir(join(dir, 'libs/auth-strategies/supabase/src'), { recursive: true });
    await writeFile(join(dir, 'libs/auth-strategies/supabase/src/index.ts'), 'export {};');
    await mkdir(join(dir, 'libs/auth-strategies/firebase/src'), { recursive: true });
    await writeFile(join(dir, 'libs/auth-strategies/firebase/src/index.ts'), 'export {};');
    await mkdir(join(dir, 'apps/microservices/auth/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/src/app/app.module.ts'),
      `import { createClient } from '@supabase/supabase-js';\nimport { SupabaseAuthStrategy } from '@icore/auth-supabase';\nimport { FirebaseAuthStrategy } from '@icore/auth-firebase';\ncase 'supabase': return new SupabaseAuthStrategy(createClient('', ''));\ncase 'firebase': return new FirebaseAuthStrategy();`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/auth-supabase":["./libs/auth-strategies/supabase/src/index.ts"],"@icore/auth-firebase":["./libs/auth-strategies/firebase/src/index.ts"]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/auth'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/package.json'),
      JSON.stringify(
        {
          name: 'auth',
          dependencies: { '@icore/auth-supabase': '*', '@icore/auth-firebase': '*' },
        },
        null,
        2,
      ),
    );

    await removeUnusedAuthStrategies(dir, 'firebase');

    await expect(access(join(dir, 'libs/auth-strategies/supabase'))).rejects.toThrow();
    const mod = await readFile(join(dir, 'apps/microservices/auth/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/auth-supabase');
    expect(mod).not.toContain('@supabase/supabase-js');
    expect(mod).toContain('FirebaseAuthStrategy');
  });
});

describe('removeUnusedStorageStrategies', () => {
  it('upload=supabase removes firebase+cloudinary libs and strips from upload module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-storage-'));

    for (const s of ['supabase', 'firebase', 'cloudinary']) {
      await mkdir(join(dir, `libs/storage-strategies/${s}/src`), { recursive: true });
      await writeFile(join(dir, `libs/storage-strategies/${s}/src/index.ts`), 'export {};');
    }
    await mkdir(join(dir, 'apps/microservices/upload/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/upload/src/app/app.module.ts'),
      `import * as admin from 'firebase-admin';\nimport { v2 as cloudinary } from 'cloudinary';\nimport { FirebaseStorageStrategy } from '@icore/storage-firebase';\nimport { CloudinaryStorageStrategy } from '@icore/storage-cloudinary';\nimport { SupabaseStorageStrategy } from '@icore/storage-supabase';\nfunction makeFirebaseStorage() {}\nfunction makeCloudinaryStorage() {}\ncase 'firebase': return makeFirebaseStorage();\ncase 'cloudinary': return makeCloudinaryStorage();\ncase 'supabase': return new SupabaseStorageStrategy();`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/storage-supabase":[""],"@icore/storage-firebase":[""],"@icore/storage-cloudinary":[""]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/upload'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/upload/package.json'),
      JSON.stringify(
        {
          name: 'upload',
          dependencies: {
            '@icore/storage-supabase': '*',
            '@icore/storage-firebase': '*',
            '@icore/storage-cloudinary': '*',
          },
        },
        null,
        2,
      ),
    );

    await removeUnusedStorageStrategies(dir, 'supabase');

    await expect(access(join(dir, 'libs/storage-strategies/firebase'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/storage-strategies/cloudinary'))).rejects.toThrow();
    const mod = await readFile(
      join(dir, 'apps/microservices/upload/src/app/app.module.ts'),
      'utf8',
    );
    expect(mod).not.toContain('@icore/storage-firebase');
    expect(mod).not.toContain('@icore/storage-cloudinary');
    expect(mod).not.toContain('firebase-admin');
    expect(mod).not.toContain("from 'cloudinary'");
    expect(mod).not.toContain('makeFirebaseStorage');
    expect(mod).not.toContain('makeCloudinaryStorage');
    expect(mod).toContain('SupabaseStorageStrategy');
  });
});

describe('removeUnusedDbStrategies', () => {
  it('db=supabase removes firestore lib and strips from notes module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-db-'));

    for (const s of ['supabase', 'firestore']) {
      await mkdir(join(dir, `libs/db-strategies/${s}/src`), { recursive: true });
      await writeFile(join(dir, `libs/db-strategies/${s}/src/index.ts`), 'export {};');
    }
    await mkdir(join(dir, 'apps/microservices/notes/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/notes/src/app/app.module.ts'),
      `import * as admin from 'firebase-admin';\nimport { FirestoreDBStrategy } from '@icore/db-firestore';\nimport { SupabaseDBStrategy } from '@icore/db-supabase';\nif (provider === 'firestore') { return new FirestoreDBStrategy(admin.firestore()); }\nif (provider === 'supabase') { return new SupabaseDBStrategy(); }`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/db-supabase":[""],"@icore/db-firestore":[""]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/notes'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/notes/package.json'),
      JSON.stringify(
        { name: 'notes', dependencies: { '@icore/db-supabase': '*', '@icore/db-firestore': '*' } },
        null,
        2,
      ),
    );

    await removeUnusedDbStrategies(dir, 'supabase');

    await expect(access(join(dir, 'libs/db-strategies/firestore'))).rejects.toThrow();
    const mod = await readFile(join(dir, 'apps/microservices/notes/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/db-firestore');
    expect(mod).not.toContain('firebase-admin');
    expect(mod).toContain('SupabaseDBStrategy');
  });
});
```

Make sure all three functions are imported at the top of the test file alongside the existing imports.

### Step 2: Run tests to verify they fail

```bash
yarn nx test create-icore 2>&1 | tail -5
```

Expected: FAIL — `removeUnusedAuthStrategies is not a function`

### Step 3: Implement the three functions in `scaffold.ts`

Add after `removeNotesStack`. Read the existing file first to understand the exact content of the real app.module.ts files you're stripping. The real module strings are known exactly from the source files — use string literal replacements for multi-line blocks.

```typescript
export async function removeUnusedAuthStrategies(
  targetDir: string,
  authProvider: string,
): Promise<void> {
  const authModulePath = join(targetDir, 'apps/microservices/auth/src/app/app.module.ts');

  if (authProvider === 'supabase') {
    // Remove Firebase auth strategy lib
    await rm(join(targetDir, 'libs/auth-strategies/firebase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/auth/package.json'), [
      '@icore/auth-firebase',
    ]);
    await stripTsconfigPath(targetDir, '@icore/auth-firebase');
    try {
      const src = await readFile(authModulePath, 'utf8');
      const next = src
        .replace(/^import \* as admin from 'firebase-admin';\n/m, '')
        .replace(
          /^import \{ FirebaseAuthStrategy, HttpIdentityToolkitClient \} from '@icore\/auth-firebase';\n/m,
          '',
        )
        .replace(/^function makeFirebaseStrategy[\s\S]*?^}\n/m, '')
        .replace(/\n {10}case 'firebase':\n {12}return makeFirebaseStrategy\(cfg\);\n/m, '');
      await writeFile(authModulePath, next);
    } catch {
      /* ignore */
    }
  }

  if (authProvider === 'firebase') {
    // Remove Supabase auth strategy lib
    await rm(join(targetDir, 'libs/auth-strategies/supabase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/auth/package.json'), [
      '@icore/auth-supabase',
    ]);
    await stripTsconfigPath(targetDir, '@icore/auth-supabase');
    try {
      const src = await readFile(authModulePath, 'utf8');
      const next = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/m, '')
        .replace(/^import \{ SupabaseAuthStrategy \} from '@icore\/auth-supabase';\n/m, '')
        .replace(
          /\n {10}case 'supabase': \{[\s\S]*?return new SupabaseAuthStrategy\(\{ client \}\);\n {10}\}\n/m,
          '',
        );
      await writeFile(authModulePath, next);
    } catch {
      /* ignore */
    }
  }
}

export async function removeUnusedStorageStrategies(
  targetDir: string,
  uploadProvider: string,
): Promise<void> {
  if (uploadProvider === 'none') return; // entire upload stack already removed
  const uploadModulePath = join(targetDir, 'apps/microservices/upload/src/app/app.module.ts');

  const toRemove: string[] = [];
  if (uploadProvider !== 'firebase') toRemove.push('firebase');
  if (uploadProvider !== 'cloudinary') toRemove.push('cloudinary');
  if (uploadProvider !== 'supabase') toRemove.push('supabase');

  for (const s of toRemove) {
    await rm(join(targetDir, `libs/storage-strategies/${s}`), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/upload/package.json'), [
      `@icore/storage-${s}`,
    ]);
    await stripTsconfigPath(targetDir, `@icore/storage-${s}`);
  }

  try {
    let src = await readFile(uploadModulePath, 'utf8');
    if (uploadProvider !== 'firebase') {
      src = src
        .replace(/^import \* as admin from 'firebase-admin';\n/m, '')
        .replace(/^import \{ FirebaseStorageStrategy \} from '@icore\/storage-firebase';\n/m, '')
        .replace(/^function makeFirebaseStorage[\s\S]*?^}\n/m, '')
        .replace(/\n {10}case 'firebase':\n {12}return makeFirebaseStorage\(cfg\);\n/m, '');
    }
    if (uploadProvider !== 'cloudinary') {
      src = src
        .replace(/^import \{ v2 as cloudinary \} from 'cloudinary';\n/m, '')
        .replace(
          /^import \{ CloudinaryStorageStrategy, type CloudinaryApiLike \} from '@icore\/storage-cloudinary';\n/m,
          '',
        )
        .replace(/^function makeCloudinaryStorage[\s\S]*?^}\n/m, '')
        .replace(/\n {10}case 'cloudinary':\n {12}return makeCloudinaryStorage\(cfg\);\n/m, '');
    }
    if (uploadProvider !== 'supabase') {
      src = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/m, '')
        .replace(/^import \{ SupabaseStorageStrategy \} from '@icore\/storage-supabase';\n/m, '')
        .replace(
          /\n {10}case 'supabase': \{[\s\S]*?bucket: cfg\.getOrThrow<string>\('SUPABASE_STORAGE_BUCKET'\),\n {12}\}\);\n {10}\}\n/m,
          '',
        );
    }
    await writeFile(uploadModulePath, src);
  } catch {
    /* ignore */
  }
}

export async function removeUnusedDbStrategies(
  targetDir: string,
  dbProvider: string,
): Promise<void> {
  const notesModulePath = join(targetDir, 'apps/microservices/notes/src/app/app.module.ts');

  if (dbProvider === 'supabase') {
    await rm(join(targetDir, 'libs/db-strategies/firestore'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/notes/package.json'), [
      '@icore/db-firestore',
    ]);
    await stripTsconfigPath(targetDir, '@icore/db-firestore');
    try {
      const src = await readFile(notesModulePath, 'utf8');
      const next = src
        .replace(/^import \* as admin from 'firebase-admin';\n/m, '')
        .replace(/^import \{ FirestoreDBStrategy \} from '@icore\/db-firestore';\n/m, '')
        .replace(
          /\n {8}if \(provider === 'firestore' \|\| provider === 'firebase'\) \{[\s\S]*?return new FirestoreDBStrategy\(\{[\s\S]*?\}\);\n {8}\}\n/m,
          '',
        );
      await writeFile(notesModulePath, next);
    } catch {
      /* ignore */
    }
  }

  if (dbProvider === 'firebase') {
    await rm(join(targetDir, 'libs/db-strategies/supabase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/notes/package.json'), [
      '@icore/db-supabase',
    ]);
    await stripTsconfigPath(targetDir, '@icore/db-supabase');
    try {
      const src = await readFile(notesModulePath, 'utf8');
      const next = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/m, '')
        .replace(/^import \{ SupabaseDBStrategy \} from '@icore\/db-supabase';\n/m, '')
        .replace(
          /\n {8}if \(provider === 'supabase'\) \{[\s\S]*?return new SupabaseDBStrategy\(\{ client \}\);\n {8}\}\n/m,
          '',
        );
      await writeFile(notesModulePath, next);
    } catch {
      /* ignore */
    }
  }
}
```

Also add a private helper `stripTsconfigPath` after `stripDeps`:

```typescript
async function stripTsconfigPath(targetDir: string, alias: string): Promise<void> {
  const tsconfigPath = join(targetDir, 'tsconfig.base.json');
  try {
    const src = await readFile(tsconfigPath, 'utf8');
    const escaped = alias.replace(/\//g, '\\/').replace(/@/g, '@');
    const next = src.replace(new RegExp(`^\\s*"${escaped}": \\[[^\\]]*\\],?\\n`, 'm'), '');
    await writeFile(tsconfigPath, next);
  } catch {
    /* ignore */
  }
}
```

### Step 4: Wire into `scaffold()`

In the `scaffold()` function, after `if (opts.example === 'none') await removeNotesStack(opts.targetDir);`, add:

```typescript
await removeUnusedAuthStrategies(opts.targetDir, opts.authProvider);
await removeUnusedStorageStrategies(opts.targetDir, opts.upload);
await removeUnusedDbStrategies(opts.targetDir, opts.dbProvider);
```

### Step 5: Fix integration tests — add stubs to `makeFakeTemplates`

The integration test's `makeFakeTemplates` needs stubs for all strategy libs + MS app.module.ts stubs. Read `scaffold.integration.unit.test.ts` and add inside `makeFakeTemplates()`:

```typescript
// Auth strategy stubs
for (const s of ['supabase', 'firebase']) {
  await mkdir(join(tplDir, `libs/auth-strategies/${s}/src`), { recursive: true });
  await writeFile(join(tplDir, `libs/auth-strategies/${s}/src/index.ts`), 'export {};');
}

// Storage strategy stubs
for (const s of ['supabase', 'firebase', 'cloudinary']) {
  await mkdir(join(tplDir, `libs/storage-strategies/${s}/src`), { recursive: true });
  await writeFile(join(tplDir, `libs/storage-strategies/${s}/src/index.ts`), 'export {};');
}

// DB strategy stubs
for (const s of ['supabase', 'firestore']) {
  await mkdir(join(tplDir, `libs/db-strategies/${s}/src`), { recursive: true });
  await writeFile(join(tplDir, `libs/db-strategies/${s}/src/index.ts`), 'export {};');
}

// Minimal tsconfig.base.json with all strategy paths
await writeFile(
  join(tplDir, 'tsconfig.base.json'),
  JSON.stringify(
    {
      compilerOptions: {
        paths: {
          '@icore/auth-supabase': ['./libs/auth-strategies/supabase/src/index.ts'],
          '@icore/auth-firebase': ['./libs/auth-strategies/firebase/src/index.ts'],
          '@icore/storage-supabase': ['./libs/storage-strategies/supabase/src/index.ts'],
          '@icore/storage-firebase': ['./libs/storage-strategies/firebase/src/index.ts'],
          '@icore/storage-cloudinary': ['./libs/storage-strategies/cloudinary/src/index.ts'],
          '@icore/db-supabase': ['./libs/db-strategies/supabase/src/index.ts'],
          '@icore/db-firestore': ['./libs/db-strategies/firestore/src/index.ts'],
        },
      },
    },
    null,
    2,
  ),
);

// Auth MS package.json with both auth strategy deps
await mkdir(join(tplDir, 'apps/microservices/auth'), { recursive: true });
await writeFile(
  join(tplDir, 'apps/microservices/auth/package.json'),
  JSON.stringify(
    { name: 'auth', dependencies: { '@icore/auth-supabase': '*', '@icore/auth-firebase': '*' } },
    null,
    2,
  ),
);
// Auth MS app.module.ts stub with firebase marker
await mkdir(join(tplDir, 'apps/microservices/auth/src/app'), { recursive: true });
await writeFile(
  join(tplDir, 'apps/microservices/auth/src/app/app.module.ts'),
  `import * as admin from 'firebase-admin';\nimport { FirebaseAuthStrategy } from '@icore/auth-firebase';\nimport { SupabaseAuthStrategy } from '@icore/auth-supabase';\n`,
);

// Upload MS package.json with all storage strategy deps
await mkdir(join(tplDir, 'apps/microservices/upload'), { recursive: true });
await writeFile(
  join(tplDir, 'apps/microservices/upload/package.json'),
  JSON.stringify(
    {
      name: 'upload',
      dependencies: {
        '@icore/storage-supabase': '*',
        '@icore/storage-firebase': '*',
        '@icore/storage-cloudinary': '*',
      },
    },
    null,
    2,
  ),
);
// Upload MS app.module.ts stub
await mkdir(join(tplDir, 'apps/microservices/upload/src/app'), { recursive: true });
await writeFile(
  join(tplDir, 'apps/microservices/upload/src/app/app.module.ts'),
  `import * as admin from 'firebase-admin';\nimport { v2 as cloudinary } from 'cloudinary';\nimport { FirebaseStorageStrategy } from '@icore/storage-firebase';\nimport { CloudinaryStorageStrategy } from '@icore/storage-cloudinary';\nimport { SupabaseStorageStrategy } from '@icore/storage-supabase';\nfunction makeFirebaseStorage() {}\nfunction makeCloudinaryStorage() {}\n`,
);

// Notes MS package.json with both DB strategy deps
await mkdir(join(tplDir, 'apps/microservices/notes'), { recursive: true });
await writeFile(
  join(tplDir, 'apps/microservices/notes/package.json'),
  JSON.stringify(
    { name: 'notes', dependencies: { '@icore/db-supabase': '*', '@icore/db-firestore': '*' } },
    null,
    2,
  ),
);
// Notes MS app.module.ts stub
await mkdir(join(tplDir, 'apps/microservices/notes/src/app'), { recursive: true });
await writeFile(
  join(tplDir, 'apps/microservices/notes/src/app/app.module.ts'),
  `import * as admin from 'firebase-admin';\nimport { FirestoreDBStrategy } from '@icore/db-firestore';\nimport { SupabaseDBStrategy } from '@icore/db-supabase';\n`,
);
```

Also add an integration test case for `auth=supabase`:

```typescript
it('prunes unused strategies when auth=supabase, upload=supabase, db=supabase', async () => {
  const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'supabase-app');
  await scaffold(
    {
      projectName: 'supabase-app',
      targetDir: outputDir,
      authProvider: 'supabase',
      dbProvider: 'supabase',
      upload: 'supabase',
      payment: 'none',
      jobs: 'none',
      example: 'notes',
      ui: 'shadcn',
      transport: 'tcp',
      initGit: false,
      install: false,
    },
    templatesDir,
  );

  // Unused libs removed
  await expect(access(join(outputDir, 'libs/auth-strategies/firebase'))).rejects.toThrow();
  await expect(access(join(outputDir, 'libs/storage-strategies/firebase'))).rejects.toThrow();
  await expect(access(join(outputDir, 'libs/storage-strategies/cloudinary'))).rejects.toThrow();
  await expect(access(join(outputDir, 'libs/db-strategies/firestore'))).rejects.toThrow();

  // Supabase libs kept
  const authLib = await access(join(outputDir, 'libs/auth-strategies/supabase'))
    .then(() => true)
    .catch(() => false);
  expect(authLib).toBe(true);

  // Auth module no longer imports firebase
  const authMod = await readFile(
    join(outputDir, 'apps/microservices/auth/src/app/app.module.ts'),
    'utf8',
  );
  expect(authMod).not.toContain('@icore/auth-firebase');
  expect(authMod).not.toContain('firebase-admin');

  // tsconfig has no firebase/cloudinary paths
  const tsconfig = await readFile(join(outputDir, 'tsconfig.base.json'), 'utf8');
  expect(tsconfig).not.toContain('@icore/auth-firebase');
  expect(tsconfig).not.toContain('@icore/storage-firebase');
  expect(tsconfig).not.toContain('@icore/storage-cloudinary');
});
```

Also update all existing scaffold calls in the integration test to include strategy-related stubs that already exist in `makeFakeTemplates` — they already have these from the stubs added above so existing tests should still pass.

### Step 6: Run tests

```bash
yarn nx test create-icore 2>&1 | tail -10
```

Expected: all tests pass (at least 37 now).

### Step 7: Lint

```bash
yarn nx lint create-icore 2>&1 | tail -5
```

Expected: clean.

### Step 8: Commit

```bash
npx prettier --write \
  tools/create-icore/src/lib/scaffold.ts \
  tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts \
  tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts
git add tools/create-icore/src/lib/scaffold.ts \
        tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts \
        tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts
git commit -m "feat(create-icore): prune unused strategy libs at scaffold time (auth/storage/db)"
```

---

## Task 4: Changeset + rebuild snapshot

**Files:**

- Create: `.changeset/fix-runtime-bugs.md`
- Rebuild: `tools/create-icore/templates/` (run nx build)

- [ ] **Step 1: Create changeset**

```markdown
---
'@idevconn/create-icore': patch
---

fix: three runtime bugs in generated projects

1. node:crypto in browser — FakeAuthStrategy/FakeStorageStrategy now use
   globalThis.crypto.randomUUID() which works in both Node 20+ and browsers
2. Cryptic crash on empty env vars — MS factories now call requireEnv() which
   throws a human-readable error naming the .env file to fix
3. Unused strategy builds — scaffold now removes non-selected auth/storage/db
   strategy libs and strips their imports from MS modules (e.g. --auth=supabase
   removes libs/auth-strategies/firebase and firebase-admin import from auth MS)
```

- [ ] **Step 2: Rebuild snapshot**

```bash
yarn nx build create-icore 2>&1 | tail -5
```

Expected: `Successfully ran target build for project create-icore`

- [ ] **Step 3: Verify snapshot has correct module files**

```bash
grep -c "firebase-admin\|FirebaseAuthStrategy" \
  tools/create-icore/templates/apps/microservices/auth/src/app/app.module.ts
```

Expected: the template still has both strategies (snapshot copies source as-is; pruning happens at scaffold time).

- [ ] **Step 4: Run full test suite**

```bash
yarn nx run-many -t test --exclude="*-e2e,client-shadcn,client-antd,client-mui" 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 5: Prettier + lint full suite**

```bash
npx prettier --write .changeset/fix-runtime-bugs.md
yarn nx run-many -t lint --exclude="*-e2e,client-shadcn,client-antd,client-mui" 2>&1 | tail -3
```

- [ ] **Step 6: Commit**

```bash
git add .changeset/fix-runtime-bugs.md
git commit -m "chore: changeset for plan-14 runtime fixes"
```

---

## Self-Review

**Spec coverage:**

- Bug 1 (node:crypto): Task 1 ✅
- Bug 2 (empty env crash): Task 2 ✅
- Bug 3 (unused strategy builds): Task 3 ✅
- Changeset + snapshot rebuild: Task 4 ✅

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**

- `removeUnusedAuthStrategies(targetDir: string, authProvider: string)` — consistent across Task 3 unit test, implementation, and wiring.
- `removeUnusedStorageStrategies(targetDir: string, uploadProvider: string)` — consistent.
- `removeUnusedDbStrategies(targetDir: string, dbProvider: string)` — consistent.
- `stripTsconfigPath(targetDir: string, alias: string)` — private helper, consistent with usage.

**Gap check:** DB strategy pruning included (notes MS). The `notes-e2e` package is not in the templates so no pruning needed there. `--upload=none` short-circuits `removeUnusedStorageStrategies`. No gap found.
