# Blueprint Generator — Phase 2c-wire: Switch the DB Axis

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Make the notes microservice's `app.module.ts` **static + provider-agnostic** — it imports a generated `db.provider.ts` wiring the ONE chosen DB `DynamicModule` (Phase 2c). The generator writes `db.provider.ts` for the chosen provider and prunes unchosen DB artifacts via the manifest, **replacing the regex `removeUnusedDbStrategies`**. Last provider-axis switch. Mirror of merged Phase 2b-wire (storage).

**Architecture:** `notes/src/app/app.module.ts` becomes ~20 static lines (`ConfigModule` + `DbProviderModule` + `NotesController`). Committed `db.provider.ts` default = supabase → `export const DbProviderModule = SupabaseDbModule.forRoot(ENV_PATH)`. The generator overwrites it per chosen provider and rm's unchosen DB libs + their tsPaths aliases + raw SDK deps from the notes `package.json`. `NotesController`'s `@Inject('DBStrategy')` is unchanged.

**Tech Stack:** TS, NestJS, generator (`tools/create-icore/src/`), Vitest. Generator tests: `yarn nx test create-icore`. iCore notes MS: `yarn nx build notes` / `yarn nx test notes`.

> **⚠ `example=none` path:** DB is consumed only by the notes MS; when `example=none` the whole notes MS is removed by `removeNotesStack` (scaffold.ts:182). The new DB wiring + cleanup MUST be skipped then — guard with `if (opts.example !== 'none')`.
> **⚠ firebase→firestore:** the `firebase` DB provider maps (via the manifest) to the `firestore` lib / `FirestoreDbModule`. `writeDbProvider`/`cleanupUnusedDb` read `MANIFEST.db[provider]`, so the mapping is automatic — do NOT special-case it.
> **Token** `'DBStrategy'`. Notes has no provider-specific app tests → no `appTests`. firebase-admin in the notes package.json is handled by `removeFirebaseAdminLib` (gated on `firebaseUsed`).
> **Raw-dep stripping:** like storage's `cleanupUnusedStorage`, `cleanupUnusedDb` strips the manifest unit's raw `deps` keys too (the notes package.json carries raw `@supabase/supabase-js`).
> **Consolidation note:** `wire-db.ts` will be the 3rd near-copy of `wire-auth`/`wire-storage`. The generic `wire-provider` extraction (+ backfilling the auth raw-dep strip) is a SEPARATE follow-up PR — NOT in scope here. Keep this PR a clean mirror.

---

## File Structure

- Modify: `apps/microservices/notes/src/app/app.module.ts` — static version
- Create: `apps/microservices/notes/src/app/db.provider.ts` — committed default (supabase)
- Create: `tools/create-icore/src/manifest/wire-db.ts` — `writeDbProvider` + `cleanupUnusedDb`
- Modify: `tools/create-icore/src/lib/scaffold.ts` — call new wiring guarded by `example !== 'none'`; drop `removeUnusedDbStrategies` import/re-export
- Modify: `tools/create-icore/src/lib/scaffold-strip.ts` — DELETE `removeUnusedDbStrategies`
- Modify: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` — remove its `describe('removeUnusedDbStrategies', ...)` block
- Create: `tools/create-icore/src/manifest/__tests__/wire-db.unit.test.ts`
- Create: `.changeset/blueprint-phase2c-wire.md`

---

### Task 1: Static notes app.module + committed db.provider.ts

**Files:**

- Create: `apps/microservices/notes/src/app/db.provider.ts`
- Modify: `apps/microservices/notes/src/app/app.module.ts`

- [ ] **Step 1: `db.provider.ts` (committed default = supabase)**

```ts
import { SupabaseDbModule } from '@icore/db-supabase';

// DB provider wiring. Selected at scaffold time by create-icore; the committed
// default is supabase (matches DB_PROVIDER=supabase in .env.example). The chosen
// XDbModule.forRoot owns construction, required-env, and the dev-fake / prod-fail
// fallback.
const ENV_PATH = 'apps/microservices/notes/.env';

export const DbProviderModule = SupabaseDbModule.forRoot(ENV_PATH);
```

- [ ] **Step 2: Static `app.module.ts`**

```ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotesController } from './notes.controller';
import { DbProviderModule } from './db.provider';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/notes/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    DbProviderModule,
  ],
  controllers: [NotesController],
})
export class AppModule {}
```

- [ ] **Step 3: Verify iCore's notes MS**

Run: `yarn nx build notes 2>&1 | tail -5` → green.
Run: `yarn nx test notes 2>&1 | tail -6` → green (notes tests construct the controller directly; unaffected).

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/db.provider.ts apps/microservices/notes/src/app/app.module.ts
git commit -m "refactor(notes): static app.module importing generated db.provider"
```

---

### Task 2: `writeDbProvider` + `cleanupUnusedDb`

**Files:**

- Create: `tools/create-icore/src/manifest/wire-db.ts`
- Test: `tools/create-icore/src/manifest/__tests__/wire-db.unit.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDbProvider, cleanupUnusedDb } from '../wire-db.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wire-db-'));
  await mkdir(join(dir, 'apps/microservices/notes/src/app'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/notes/src/app/db.provider.ts'),
    `import { SupabaseDbModule } from '@icore/db-supabase';\nexport const DbProviderModule = SupabaseDbModule.forRoot('x');\n`,
  );
  for (const d of ['supabase', 'firestore', 'mongodb']) {
    await mkdir(join(dir, `libs/db-strategies/${d}/src`), { recursive: true });
    await writeFile(join(dir, `libs/db-strategies/${d}/src/index.ts`), 'export {};');
  }
  await writeFile(
    join(dir, 'apps/microservices/notes/package.json'),
    JSON.stringify({
      name: 'notes',
      dependencies: {
        '@icore/db-supabase': '*',
        '@icore/db-firestore': '*',
        '@supabase/supabase-js': '^2.106.2',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/db-supabase': ['libs/db-strategies/supabase/src/index.ts'],
          '@icore/db-firestore': ['libs/db-strategies/firestore/src/index.ts'],
          '@icore/db-mongodb': ['libs/db-strategies/mongodb/src/index.ts'],
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

describe('writeDbProvider', () => {
  it('wires the chosen db module (firebase → firestore lib)', async () => {
    const dir = await fixture();
    await writeDbProvider(dir, 'firebase');
    const src = await readFile(
      join(dir, 'apps/microservices/notes/src/app/db.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/db-firestore'");
    expect(src).toContain('FirestoreDbModule.forRoot');
    expect(src).not.toContain('SupabaseDbModule');
  });
});

describe('cleanupUnusedDb', () => {
  it('removes unchosen db libs (firebase→firestore dir), tsconfig paths, workspace+raw deps; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedDb(dir, 'firebase'); // chosen = firebase → keep firestore lib

    expect(await exists(join(dir, 'libs/db-strategies/firestore'))).toBe(true);
    expect(await exists(join(dir, 'libs/db-strategies/supabase'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/mongodb'))).toBe(false);

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/notes/package.json'), 'utf8'),
    );
    expect(pkg.dependencies['@icore/db-firestore']).toBe('*');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-supabase');
    expect(pkg.dependencies).not.toHaveProperty('@supabase/supabase-js'); // supabase raw dep stripped

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/db-firestore']);
  });
});
```

- [ ] **Step 2: Run → fail** (`yarn nx test create-icore -- wire-db.unit`).

- [ ] **Step 3: Implement** — `wire-db.ts` (parallel to `wire-storage.ts`)

```ts
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DbProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';

const DB_PROVIDER_FILE = 'apps/microservices/notes/src/app/db.provider.ts';
const NOTES_PKG = 'apps/microservices/notes/package.json';
const ENV_PATH = 'apps/microservices/notes/.env';

export async function writeDbProvider(targetDir: string, provider: DbProvider): Promise<void> {
  const nestModule = MANIFEST.db[provider].nestModule;
  if (!nestModule) throw new Error(`db provider ${provider} has no nestModule in manifest`);
  const { importFrom, symbol } = nestModule;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${ENV_PATH}';\n\n` +
    `export const DbProviderModule = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, DB_PROVIDER_FILE), content);
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

/** Manifest-driven removal of every DB provider NOT chosen: lib dirs (firebase→firestore
 *  handled by the manifest libDirs), their workspace alias + raw SDK deps from the notes
 *  package.json + tsconfig. Replaces the regex `removeUnusedDbStrategies`. */
export async function cleanupUnusedDb(targetDir: string, chosen: DbProvider): Promise<void> {
  const providers = Object.keys(MANIFEST.db) as DbProvider[];
  for (const p of providers) {
    if (p === chosen) continue;
    const unit = MANIFEST.db[p];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    const aliases = Object.keys(unit.tsPaths);
    const rawDeps = Object.keys(unit.deps);
    const dropKeys = new Set([...aliases, ...rawDeps]);
    await stripPkgKeys(join(targetDir, NOTES_PKG), (k) => dropKeys.has(k));
    await stripTsconfigKeys(targetDir, aliases);
  }
}
```

- [ ] **Step 4: Run → pass** (`yarn nx test create-icore -- wire-db.unit`, 2 tests).

- [ ] **Step 5: Commit** `feat(create-icore): writeDbProvider + cleanupUnusedDb (manifest-driven)`.

---

### Task 3: Wire into generator + delete `removeUnusedDbStrategies`

**Files:** `scaffold.ts`, `scaffold-strip.ts`, `__tests__/scaffold.unit.test.ts`

- [ ] **Step 1: `scaffold.ts`** — replace `await removeUnusedDbStrategies(opts.targetDir, opts.dbProvider);` with:

```ts
if (opts.example !== 'none') {
  await cleanupUnusedDb(opts.targetDir, opts.dbProvider);
  await writeDbProvider(opts.targetDir, opts.dbProvider);
}
```

Add `import { cleanupUnusedDb, writeDbProvider } from '../manifest/wire-db.js';`. Remove `removeUnusedDbStrategies` from the `import` + `export` blocks.

- [ ] **Step 2: `scaffold-strip.ts`** — delete the entire `export async function removeUnusedDbStrategies(...) {...}` (incl. its `DB_BRANCH` regex + any inner `requireEnv` it declared). Keep `removeUploadStack`, `removeFirebaseAdminLib`, `removeNotesStack`, `removeJobsStack`, `removePaymentStack`, helpers. (Auth + storage strips are already gone from prior phases.)

- [ ] **Step 3: `scaffold.unit.test.ts`** — delete the `describe('removeUnusedDbStrategies', () => {...})` block + remove the symbol from imports.

- [ ] **Step 4: Run** `yarn nx test create-icore 2>&1 | tail -12` → green. Build: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|scaffold|wire-db" || echo "ok (ignore uuid DTS)"`.

- [ ] **Step 5: Commit** `feat(create-icore): switch db axis to blueprint; delete removeUnusedDbStrategies`.

---

### Task 4: E2E proof + changeset

- [ ] **Step 1: Rebuild + snapshot** `yarn nx build create-icore --skip-nx-cache 2>&1 | tail -3` (ignore uuid DTS).

- [ ] **Step 2: Headless-generate db choices + audit**

```bash
T=/tmp/icore-db-wire && rm -rf "$T" && mkdir -p "$T"
cat > "$T/gen.mjs" <<'EOF'
import { scaffold } from '/home/vladimir-tkach/Projects/22/tools/create-icore/dist/index.js';
const [db, ex] = process.argv.slice(2);
await scaffold({ projectName: `db-${db}-${ex}`, targetDir: `${process.env.T}/db-${db}-${ex}`,
  authProvider: 'supabase', dbProvider: db, upload: 'none',
  payment:'none', jobs:'none', example: ex, ui:'shadcn', transport:'tcp',
  initGit:false, packageManager:'npm', install:false },
  '/home/vladimir-tkach/Projects/22/tools/create-icore/templates');
console.log('gen', db, ex);
EOF
# example=notes → notes MS present, db wired
for db in supabase firebase mongodb; do T=$T node "$T/gen.mjs" "$db" notes; node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$T/db-$db-notes" && echo "AUDIT OK $db/notes"; done
# example=none → notes MS removed, db wiring skipped
T=$T node "$T/gen.mjs" supabase none; node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$T/db-supabase-none" && echo "AUDIT OK supabase/none"
```

Assert (example=notes, per db): `db.provider.ts` imports only the chosen module (firebase → `@icore/db-firestore`/`FirestoreDbModule`); `app.module.ts` static (no `makeXDB`/`useFactory`); unchosen db lib dirs absent (and for firebase, `libs/db-strategies/firestore` PRESENT, `supabase`+`mongodb` absent); notes `package.json` has no unchosen `@icore/db-*` nor unchosen raw SDK; `AUDIT OK`. For example=none: `apps/microservices/notes` dir absent + `AUDIT OK`. If any audit flags an orphan, STOP + fix.

- [ ] **Step 3: Changeset** `.changeset/blueprint-phase2c-wire.md`:

```md
---
'@idevconn/create-icore': minor
---

DB axis now uses the additive blueprint: the notes microservice app.module is static and imports a generated db.provider.ts wiring the one chosen XDbModule.forRoot. The regex removeUnusedDbStrategies is deleted; unchosen db libs/tsconfig-paths/workspace+raw deps are pruned via the manifest. Skipped entirely when example=none (notes MS removed). This completes the provider-axis migration — all of auth/storage/db are now blueprint-driven.
```

- [ ] **Step 4: Prettier + commit**

```bash
npx prettier --write tools/create-icore/src/manifest apps/microservices/notes/src/app
git add .changeset/blueprint-phase2c-wire.md tools/create-icore apps/microservices/notes
git commit -m "chore(create-icore): blueprint phase 2c-wire changeset + format"
```

---

## Self-Review

**Spec coverage:** §8 phase 5 (db half) + §3 "notes app.module imports the one chosen provider DynamicModule". Mirrors merged Phase 2b-wire. Completes all three provider-axis switches. The `wire-provider` consolidation + auth raw-dep backfill is a deliberately separate follow-up PR.

**Placeholder scan:** Full code; the `example=none` guard + firebase→firestore manifest mapping + raw-dep stripping are explicit. Headless proof reuses the established driver. No TBD.

**Type consistency:** `writeDbProvider(targetDir, provider: DbProvider)` + `cleanupUnusedDb(targetDir, chosen: DbProvider)` used identically in test + generator. `MANIFEST.db[provider].nestModule` from Phase 1 (symbols `SupabaseDbModule`/`FirestoreDbModule`/`MongoDbDbModule`). `'DBStrategy'` token (static app.module ← DbProviderModule ← XDbModule export) matches `NotesController`'s `@Inject('DBStrategy')`. `DbProvider = 'supabase'|'firebase'|'mongodb'`.

**Scope:** DB axis only. After this, `scaffold-strip.ts` retains only feature/notes/jobs/payment/upload removals + `removeFirebaseAdminLib` + helpers (no more provider strips). Consolidation + features/client/transport + final deletion are later.
