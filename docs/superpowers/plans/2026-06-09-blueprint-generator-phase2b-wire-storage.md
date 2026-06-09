# Blueprint Generator — Phase 2b-wire: Switch the Storage Axis

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Make the upload microservice's `app.module.ts` **static + provider-agnostic** — it imports a generated `storage.provider.ts` wiring the ONE chosen storage `DynamicModule` (Phase 2b). The generator writes `storage.provider.ts` for the chosen provider and prunes unchosen storage artifacts via the manifest, **replacing the regex `removeUnusedStorageStrategies`**. Mirror of the merged Phase 2a-wire (auth).

**Architecture:** `upload/src/app/app.module.ts` becomes ~20 static lines (`ConfigModule` + `StorageProviderModule` + `StorageController`). Committed `storage.provider.ts` default = supabase → `export const StorageProviderModule = SupabaseStorageModule.forRoot(ENV_PATH)`. The generator overwrites it per chosen provider and rm's unchosen storage libs + their tsPaths aliases + **raw SDK deps** (`cloudinary`, `@supabase/supabase-js`, `mongoose`) from the upload `package.json`. `StorageController`'s `@Inject('StorageStrategy')` is unchanged (the chosen `XStorageModule` provides+exports it).

**Tech Stack:** TS, NestJS, generator (`tools/create-icore/src/`), Vitest. Generator tests: `yarn nx test create-icore`. iCore upload MS: `yarn nx build upload` / `yarn nx test upload`.

> **⚠ `upload=none` path:** when `upload=none` the entire upload MS is removed by `removeUploadStack` (scaffold.ts:180). The new storage wiring + cleanup MUST be skipped in that case (the MS dir doesn't exist). Guard the calls with `if (opts.upload !== 'none')`.
> **⚠ Improvement over the old strip:** `removeUnusedStorageStrategies` left the raw `cloudinary` + `@supabase/supabase-js` deps in `apps/microservices/upload/package.json` (it only stripped `@icore/*` workspace deps) — a latent orphan-dep. `cleanupUnusedStorage` strips the manifest unit's raw `deps` keys too, killing that class.
> **Token** `'StorageStrategy'`. Storage has **no** provider-specific app tests (only the agnostic `storage.controller.unit.test.ts`), so no `appTests` handling. firebase-admin in the upload package.json is already handled by `removeFirebaseAdminLib` (extended in 2a-wire).

---

## File Structure

- Modify: `apps/microservices/upload/src/app/app.module.ts` — static version
- Create: `apps/microservices/upload/src/app/storage.provider.ts` — committed default (supabase)
- Create: `tools/create-icore/src/manifest/wire-storage.ts` — `writeStorageProvider` + `cleanupUnusedStorage`
- Modify: `tools/create-icore/src/lib/scaffold.ts` — call the new wiring (guarded by `upload !== 'none'`); drop `removeUnusedStorageStrategies` import/re-export
- Modify: `tools/create-icore/src/lib/scaffold-strip.ts` — DELETE `removeUnusedStorageStrategies`
- Modify: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` — remove its `describe('removeUnusedStorageStrategies', ...)` block
- Create: `tools/create-icore/src/manifest/__tests__/wire-storage.unit.test.ts`
- Create: `.changeset/blueprint-phase2b-wire.md`

---

### Task 1: Static upload app.module + committed storage.provider.ts

**Files:**

- Create: `apps/microservices/upload/src/app/storage.provider.ts`
- Modify: `apps/microservices/upload/src/app/app.module.ts`

- [ ] **Step 1: `storage.provider.ts` (committed default = supabase)**

```ts
import { SupabaseStorageModule } from '@icore/storage-supabase';

// Storage provider wiring. Selected at scaffold time by create-icore; the
// committed default is supabase (matches STORAGE_PROVIDER=supabase in
// .env.example). The chosen XStorageModule.forRoot owns construction,
// required-env, and the dev-fake / prod-fail fallback.
const ENV_PATH = 'apps/microservices/upload/.env';

export const StorageProviderModule = SupabaseStorageModule.forRoot(ENV_PATH);
```

- [ ] **Step 2: Static `app.module.ts`**

```ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageController } from './storage.controller';
import { StorageProviderModule } from './storage.provider';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/upload/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    StorageProviderModule,
  ],
  controllers: [StorageController],
})
export class AppModule {}
```

- [ ] **Step 3: Verify iCore's upload MS**

Run: `yarn nx build upload 2>&1 | tail -5` → green.
Run: `yarn nx test upload 2>&1 | tail -6` → green (`storage.controller.unit.test.ts` constructs the controller directly with a strategy; unaffected by the module change).

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/upload/src/app/storage.provider.ts apps/microservices/upload/src/app/app.module.ts
git commit -m "refactor(upload): static app.module importing generated storage.provider"
```

---

### Task 2: `writeStorageProvider` + `cleanupUnusedStorage`

**Files:**

- Create: `tools/create-icore/src/manifest/wire-storage.ts`
- Test: `tools/create-icore/src/manifest/__tests__/wire-storage.unit.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeStorageProvider, cleanupUnusedStorage } from '../wire-storage.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wire-storage-'));
  await mkdir(join(dir, 'apps/microservices/upload/src/app'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/upload/src/app/storage.provider.ts'),
    `import { SupabaseStorageModule } from '@icore/storage-supabase';\nexport const StorageProviderModule = SupabaseStorageModule.forRoot('x');\n`,
  );
  for (const p of ['supabase', 'firebase', 'cloudinary', 'mongodb']) {
    await mkdir(join(dir, `libs/storage-strategies/${p}/src`), { recursive: true });
    await writeFile(join(dir, `libs/storage-strategies/${p}/src/index.ts`), 'export {};');
  }
  await writeFile(
    join(dir, 'apps/microservices/upload/package.json'),
    JSON.stringify({
      name: 'upload',
      dependencies: {
        '@icore/storage-supabase': '*',
        '@icore/storage-firebase': '*',
        '@icore/storage-cloudinary': '*',
        '@icore/storage-mongodb': '*',
        '@supabase/supabase-js': '^2.106.2',
        cloudinary: '^2.0.0',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/storage-supabase': ['libs/storage-strategies/supabase/src/index.ts'],
          '@icore/storage-firebase': ['libs/storage-strategies/firebase/src/index.ts'],
          '@icore/storage-cloudinary': ['libs/storage-strategies/cloudinary/src/index.ts'],
          '@icore/storage-mongodb': ['libs/storage-strategies/mongodb/src/index.ts'],
        },
      },
    }),
  );
  return dir;
}

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('writeStorageProvider', () => {
  it('writes storage.provider.ts wiring the chosen provider module', async () => {
    const dir = await fixture();
    await writeStorageProvider(dir, 'cloudinary');
    const src = await readFile(
      join(dir, 'apps/microservices/upload/src/app/storage.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/storage-cloudinary'");
    expect(src).toContain('CloudinaryStorageModule.forRoot');
    expect(src).not.toContain('SupabaseStorageModule');
  });
});

describe('cleanupUnusedStorage', () => {
  it('removes unchosen libs, their tsconfig paths, workspace+raw deps; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedStorage(dir, 'supabase');

    expect(await exists(join(dir, 'libs/storage-strategies/firebase'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/cloudinary'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/mongodb'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/supabase'))).toBe(true);

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/upload/package.json'), 'utf8'),
    );
    // chosen workspace dep + its raw SDK kept; unchosen workspace + raw cloudinary gone
    expect(pkg.dependencies['@icore/storage-supabase']).toBe('*');
    expect(pkg.dependencies['@supabase/supabase-js']).toBe('^2.106.2');
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-cloudinary');
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-firebase');
    expect(pkg.dependencies).not.toHaveProperty('cloudinary');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/storage-supabase']);
  });
});
```

- [ ] **Step 2: Run → fail** (`yarn nx test create-icore -- wire-storage.unit`).

- [ ] **Step 3: Implement** — `wire-storage.ts`

```ts
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { StorageProvider } from './types.js';
import { MANIFEST } from './index.js';

const STORAGE_PROVIDER_FILE = 'apps/microservices/upload/src/app/storage.provider.ts';
const UPLOAD_PKG = 'apps/microservices/upload/package.json';
const ENV_PATH = 'apps/microservices/upload/.env';

export async function writeStorageProvider(
  targetDir: string,
  provider: StorageProvider,
): Promise<void> {
  const nestModule = MANIFEST.storage[provider].nestModule;
  if (!nestModule) throw new Error(`storage provider ${provider} has no nestModule in manifest`);
  const { importFrom, symbol } = nestModule;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${ENV_PATH}';\n\n` +
    `export const StorageProviderModule = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, STORAGE_PROVIDER_FILE), content);
}

async function stripPkgKeys(path: string, drop: (k: string) => boolean): Promise<void> {
  try {
    const pkg = JSON.parse(await readFile(path, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const k of Object.keys(deps)) if (drop(k)) delete deps[k];
    }
    await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // pkg may be absent in partial fixtures
  }
}

async function stripTsconfigKeys(targetDir: string, aliases: string[]): Promise<void> {
  const path = join(targetDir, 'tsconfig.base.json');
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    const paths = parsed.compilerOptions?.paths;
    if (paths) for (const a of aliases) delete paths[a];
    await writeFile(path, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    // tsconfig may be absent in partial fixtures
  }
}

/** Manifest-driven removal of every storage provider NOT chosen: lib dirs, their
 *  workspace alias (tsconfig + upload package.json), and their raw SDK deps from
 *  the upload package.json. Replaces the regex `removeUnusedStorageStrategies`. */
export async function cleanupUnusedStorage(
  targetDir: string,
  chosen: StorageProvider,
): Promise<void> {
  const providers = Object.keys(MANIFEST.storage) as StorageProvider[];
  for (const p of providers) {
    if (p === chosen) continue;
    const unit = MANIFEST.storage[p];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    const aliases = Object.keys(unit.tsPaths);
    const rawDeps = Object.keys(unit.deps);
    const dropKeys = new Set([...aliases, ...rawDeps]);
    await stripPkgKeys(join(targetDir, UPLOAD_PKG), (k) => dropKeys.has(k));
    await stripTsconfigKeys(targetDir, aliases);
  }
}
```

> `StorageProvider` is `Exclude<UploadProvider,'none'>` — already exported from `tools/create-icore/src/manifest/types.ts` (Phase 1). Confirm; if not exported there, export it.

- [ ] **Step 4: Run → pass** (`yarn nx test create-icore -- wire-storage.unit`, 2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/manifest/wire-storage.ts tools/create-icore/src/manifest/__tests__/wire-storage.unit.test.ts
git commit -m "feat(create-icore): writeStorageProvider + cleanupUnusedStorage (manifest-driven)"
```

---

### Task 3: Wire into generator + delete `removeUnusedStorageStrategies`

**Files:** `tools/create-icore/src/lib/scaffold.ts`, `scaffold-strip.ts`, `__tests__/scaffold.unit.test.ts`

- [ ] **Step 1: `scaffold.ts`** — replace `await removeUnusedStorageStrategies(opts.targetDir, opts.upload);` with a guarded block:

```ts
if (opts.upload !== 'none') {
  await cleanupUnusedStorage(opts.targetDir, opts.upload);
  await writeStorageProvider(opts.targetDir, opts.upload);
}
```

(`opts.upload` is `UploadProvider`; inside the guard it is narrowed to `StorageProvider` = non-`none`. If TS doesn't narrow it for the function-arg types, cast via a local `const provider = opts.upload as Exclude<typeof opts.upload, 'none'>;`.) Add `import { cleanupUnusedStorage, writeStorageProvider } from '../manifest/wire-storage.js';`. Remove `removeUnusedStorageStrategies` from the `import` + `export` blocks.

- [ ] **Step 2: `scaffold-strip.ts`** — delete the entire `export async function removeUnusedStorageStrategies(...) {...}` (incl. its `STORAGE_BRANCH` regex). Keep `removeUnusedDbStrategies`, `removeUploadStack`, helpers.

- [ ] **Step 3: `scaffold.unit.test.ts`** — delete the `describe('removeUnusedStorageStrategies', () => {...})` block + remove the symbol from imports. Keep the db block.

- [ ] **Step 4: Run** `yarn nx test create-icore 2>&1 | tail -12` → green. Build: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|scaffold|wire-storage" || echo "ok (ignore uuid DTS)"`.

- [ ] **Step 5: Commit** `feat(create-icore): switch storage axis to blueprint; delete removeUnusedStorageStrategies`.

---

### Task 4: E2E proof + changeset

- [ ] **Step 1: Rebuild + snapshot** `yarn nx build create-icore --skip-nx-cache 2>&1 | tail -3` (ignore uuid DTS).

- [ ] **Step 2: Headless-generate all storage choices + audit**

```bash
T=/tmp/icore-storage-wire && rm -rf "$T" && mkdir -p "$T"
cat > "$T/gen.mjs" <<'EOF'
import { scaffold } from '/home/vladimir-tkach/Projects/22/tools/create-icore/dist/index.js';
const up = process.argv[2];
await scaffold({ projectName: `up-${up}`, targetDir: `${process.env.T}/up-${up}`,
  authProvider: 'supabase', dbProvider: 'supabase', upload: up,
  payment:'none', jobs:'none', example:'none', ui:'shadcn', transport:'tcp',
  initGit:false, packageManager:'npm', install:false },
  '/home/vladimir-tkach/Projects/22/tools/create-icore/templates');
console.log('gen', up);
EOF
for up in supabase firebase cloudinary mongodb none; do T=$T node "$T/gen.mjs" "$up"; node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$T/up-$up" && echo "AUDIT OK $up"; done
```

Assert, for each non-`none`: `storage.provider.ts` imports only the chosen module; `app.module.ts` static (no `makeXStorage`/`useFactory`); unchosen storage lib dirs absent; upload `package.json` has no unchosen raw SDK dep (`cloudinary`/`@supabase/supabase-js`) nor unchosen `@icore/storage-*`; `AUDIT OK`. For `upload=none`: the `apps/microservices/upload` dir is absent entirely (removeUploadStack) and `AUDIT OK`. If any audit flags an orphan, STOP and fix.

- [ ] **Step 3: Changeset** `.changeset/blueprint-phase2b-wire.md`:

```md
---
'@idevconn/create-icore': minor
---

Storage axis now uses the additive blueprint: the upload microservice app.module is static and imports a generated storage.provider.ts wiring the one chosen XStorageModule.forRoot. The regex removeUnusedStorageStrategies is deleted; unchosen storage libs/tsconfig-paths/workspace+raw deps are pruned via the manifest (also fixing the previously-orphaned cloudinary/@supabase/supabase-js deps in the upload package.json). Skipped entirely when upload=none.
```

- [ ] **Step 4: Prettier + commit**

```bash
npx prettier --write tools/create-icore/src/manifest apps/microservices/upload/src/app
git add .changeset/blueprint-phase2b-wire.md tools/create-icore apps/microservices/upload
git commit -m "chore(create-icore): blueprint phase 2b-wire changeset + format"
```

---

## Self-Review

**Spec coverage:** §8 phase 5 (storage half) + §3 "upload app.module imports the one chosen provider DynamicModule" via generated `storage.provider.ts`. Mirrors merged Phase 2a-wire. Improves on the old strip by also pruning raw SDK deps. db axis is a separate plan.

**Placeholder scan:** Full code throughout; the `upload=none` guard + raw-dep stripping are explicit. The headless proof reuses the Phase-1/2a-wire driver. No TBD.

**Type consistency:** `writeStorageProvider(targetDir, provider: StorageProvider)` + `cleanupUnusedStorage(targetDir, chosen: StorageProvider)` used identically in test + generator. `MANIFEST.storage[provider].nestModule` (`{importFrom, symbol}`) from Phase 1. `'StorageStrategy'` token (static app.module ← StorageProviderModule ← XStorageModule export) matches `StorageController`'s `@Inject('StorageStrategy')`. `StorageProvider = Exclude<UploadProvider,'none'>`.

**Scope:** Storage axis only. Auth done; db + features/client/transport later. The `wire-storage.ts` duplicates `wire-auth.ts` structure — acceptable for now; consolidate into a generic `wire-provider.ts` once db lands (3rd copy).
