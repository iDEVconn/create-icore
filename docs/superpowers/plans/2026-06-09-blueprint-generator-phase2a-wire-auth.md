# Blueprint Generator — Phase 2a-wire: Switch the Auth Axis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the auth microservice's `app.module.ts` **static + provider-agnostic** — it imports a generated `auth.provider.ts` that wires the ONE chosen auth `DynamicModule` (from Phase 2a). The generator writes `auth.provider.ts` for the chosen provider and does a manifest-driven cleanup of unchosen auth artifacts, **replacing the regex `removeUnusedAuthStrategies` entirely**. This kills the auth orphan-bug classes (dangling symbols / orphan `REQUIRED_ENV` / orphan controller tests) by construction: the app.module is never regex-edited again.

**Architecture:** `app.module.ts` becomes ~20 static lines (`ConfigModule` + `AuthProviderModule` + controller). `auth.provider.ts` (committed default = supabase, since iCore's `.env.example` defaults `AUTH_PROVIDER=supabase`) does `export const AuthProviderModule = SupabaseAuthModule.forRoot(ENV_PATH)`. The generator overwrites `auth.provider.ts` per chosen provider and rm's the unchosen auth libs + their deps/tsPaths/controller-tests using the manifest. The `'AuthStrategy'` token is now provided+exported by the chosen `XAuthModule` (Phase 2a); `AuthController`'s `@Inject('AuthStrategy')` is unchanged.

**Tech Stack:** TypeScript, NestJS, the create-icore generator (`tools/create-icore/src/`), Vitest. Generator tests run via `yarn nx test create-icore`. iCore's auth MS builds/tests via `yarn nx build auth` / `yarn nx test auth`.

> **⚠ This is the first phase that changes generator OUTPUT and edits iCore's own live auth MS.** iCore's auth MS collapses from runtime-multi-provider to single committed provider (supabase). Real impact is negligible: iCore's `.env` is gitignored, so it already runs the `FakeAuthStrategy` fallback without creds; the single module keeps that same fallback (via Phase 2a's `buildStrategyWithFallback`). The 3 auth strategy libs still exist in the workspace (needed for the generator to copy any chosen one) and their contract tests are untouched.

---

## File Structure

- Modify: `apps/microservices/auth/src/app/app.module.ts` — replace with the static version
- Create: `apps/microservices/auth/src/app/auth.provider.ts` — committed default (supabase) wiring
- Modify: `tools/create-icore/src/manifest/types.ts` — add `appTests?: string[]` to `Unit`
- Modify: `tools/create-icore/src/manifest/index.ts` — populate `appTests` on auth units
- Create: `tools/create-icore/src/manifest/wire-auth.ts` — `writeAuthProvider` + `cleanupUnusedAuth`
- Modify: `tools/create-icore/src/lib/scaffold.ts` — call the new wiring; drop the `removeUnusedAuthStrategies` import/re-export
- Modify: `tools/create-icore/src/lib/scaffold-strip.ts` — DELETE `removeUnusedAuthStrategies`
- Modify: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` — remove the `removeUnusedAuthStrategies` describe block (lines ~250–446)
- Create: `tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts`
- Create: `.changeset/blueprint-phase2a-wire.md`

The auth `app.module.ts` is no longer touched by the generator (static). Storage/db strips remain (their axes migrate later).

---

### Task 1: Static auth app.module + committed auth.provider.ts (iCore self)

**Files:**

- Create: `apps/microservices/auth/src/app/auth.provider.ts`
- Modify: `apps/microservices/auth/src/app/app.module.ts`

- [ ] **Step 1: Write `auth.provider.ts` (committed default = supabase)**

```ts
import { SupabaseAuthModule } from '@icore/auth-supabase';

// Auth provider wiring. Selected at scaffold time by create-icore; the committed
// default is supabase (matches AUTH_PROVIDER=supabase in .env.example). The
// chosen XAuthModule.forRoot owns construction, required-env, and the
// dev-fake / prod-fail fallback (see @icore/shared buildStrategyWithFallback).
const ENV_PATH = 'apps/microservices/auth/.env';

export const AuthProviderModule = SupabaseAuthModule.forRoot(ENV_PATH);
```

- [ ] **Step 2: Replace `app.module.ts` with the static version**

```ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthProviderModule } from './auth.provider';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/auth/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    AuthProviderModule,
  ],
  controllers: [AuthController],
})
export class AppModule {}
```

The chosen `XAuthModule` provides AND exports the `'AuthStrategy'` token, so `AuthController`'s `@Inject('AuthStrategy')` resolves. No `useFactory`, `REQUIRED_ENV`, `makeXAuth`, Mongoose, or provider imports remain in `app.module.ts`.

- [ ] **Step 3: Verify iCore's auth MS still builds + tests pass**

Run: `yarn nx build auth 2>&1 | tail -5`
Expected: green (the static module compiles; `SupabaseAuthModule` comes from `@icore/auth-supabase`).
Run: `yarn nx test auth 2>&1 | tail -8`
Expected: green — the 3 controller integration tests construct `AuthController` directly with a strategy (they do NOT boot `AppModule`), so they're unaffected.

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/auth/src/app/auth.provider.ts apps/microservices/auth/src/app/app.module.ts
git commit -m "refactor(auth): static app.module importing generated auth.provider"
```

---

### Task 2: Add `appTests` to the manifest

**Files:**

- Modify: `tools/create-icore/src/manifest/types.ts`
- Modify: `tools/create-icore/src/manifest/index.ts`

- [ ] **Step 1: Extend the `Unit` interface**

In `types.ts`, add to `interface Unit` (after `clientNav?`):

```ts
  /** App-level (not lib) test files that belong to this unit and must be removed
   *  when the unit is NOT selected (they import the unit's now-absent lib). */
  appTests?: string[];
```

- [ ] **Step 2: Populate `appTests` on the auth units**

In `index.ts`, add `appTests` to the auth entries (supabase + firebase have a provider-specific controller integration test; mongodb has none):

```ts
// auth.supabase — add:
      appTests: [
        'apps/microservices/auth/src/app/__tests__/auth.controller.supabase.integration.unit.test.ts',
      ],
// auth.firebase — add:
      appTests: [
        'apps/microservices/auth/src/app/__tests__/auth.controller.firebase.integration.unit.test.ts',
      ],
// auth.mongodb — no appTests (omit the field)
```

- [ ] **Step 3: Typecheck**

Run: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "manifest/(types|index)|TS[0-9]" || echo "manifest typechecks"`
Expected: no error referencing manifest files (ignore the pre-existing `uuid` DTS error).

- [ ] **Step 4: Commit**

```bash
git add tools/create-icore/src/manifest/types.ts tools/create-icore/src/manifest/index.ts
git commit -m "feat(create-icore): manifest appTests for provider controller tests"
```

---

### Task 3: `writeAuthProvider` + `cleanupUnusedAuth`

**Files:**

- Create: `tools/create-icore/src/manifest/wire-auth.ts`
- Test: `tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthProvider, cleanupUnusedAuth } from '../wire-auth.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wire-'));
  // auth provider + app dirs
  await mkdir(join(dir, 'apps/microservices/auth/src/app/__tests__'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/auth/src/app/auth.provider.ts'),
    `import { SupabaseAuthModule } from '@icore/auth-supabase';\nexport const AuthProviderModule = SupabaseAuthModule.forRoot('x');\n`,
  );
  for (const p of ['supabase', 'firebase']) {
    await writeFile(
      join(
        dir,
        `apps/microservices/auth/src/app/__tests__/auth.controller.${p}.integration.unit.test.ts`,
      ),
      `// ${p} controller test`,
    );
  }
  // lib dirs
  for (const p of ['supabase', 'firebase', 'mongodb']) {
    await mkdir(join(dir, `libs/auth-strategies/${p}/src`), { recursive: true });
    await writeFile(join(dir, `libs/auth-strategies/${p}/src/index.ts`), 'export {};');
  }
  // auth package.json with all workspace deps + tsconfig with all aliases
  await writeFile(
    join(dir, 'apps/microservices/auth/package.json'),
    JSON.stringify({
      name: 'auth',
      dependencies: {
        '@icore/auth-supabase': '*',
        '@icore/auth-firebase': '*',
        '@icore/auth-mongodb': '*',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'],
          '@icore/auth-firebase': ['libs/auth-strategies/firebase/src/index.ts'],
          '@icore/auth-mongodb': ['libs/auth-strategies/mongodb/src/index.ts'],
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

describe('writeAuthProvider', () => {
  it('writes auth.provider.ts wiring the chosen provider module', async () => {
    const dir = await fixture();
    await writeAuthProvider(dir, 'firebase');
    const src = await readFile(
      join(dir, 'apps/microservices/auth/src/app/auth.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/auth-firebase'");
    expect(src).toContain('FirebaseAuthModule.forRoot');
    expect(src).not.toContain('SupabaseAuthModule');
  });
});

describe('cleanupUnusedAuth', () => {
  it('removes unchosen libs, their controller tests, deps and tsconfig paths; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedAuth(dir, 'supabase');

    // unchosen libs gone, chosen kept
    expect(await exists(join(dir, 'libs/auth-strategies/firebase'))).toBe(false);
    expect(await exists(join(dir, 'libs/auth-strategies/mongodb'))).toBe(false);
    expect(await exists(join(dir, 'libs/auth-strategies/supabase'))).toBe(true);

    // firebase controller test removed; supabase kept
    expect(
      await exists(
        join(
          dir,
          'apps/microservices/auth/src/app/__tests__/auth.controller.firebase.integration.unit.test.ts',
        ),
      ),
    ).toBe(false);
    expect(
      await exists(
        join(
          dir,
          'apps/microservices/auth/src/app/__tests__/auth.controller.supabase.integration.unit.test.ts',
        ),
      ),
    ).toBe(true);

    // deps + tsconfig pruned to supabase only
    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/auth/package.json'), 'utf8'),
    );
    expect(pkg.dependencies).toEqual({ '@icore/auth-supabase': '*' });
    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/auth-supabase']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -- wire-auth.unit`
Expected: FAIL — `wire-auth` not found.

- [ ] **Step 3: Write the implementation**

```ts
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuthProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';

const AUTH_PROVIDER_FILE = 'apps/microservices/auth/src/app/auth.provider.ts';
const ENV_PATH = 'apps/microservices/auth/.env';

/** Write apps/microservices/auth/src/app/auth.provider.ts wiring the chosen module. */
export async function writeAuthProvider(targetDir: string, provider: AuthProvider): Promise<void> {
  const { importFrom, symbol } = MANIFEST.auth[provider].nestModule!;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${ENV_PATH}';\n\n` +
    `export const AuthProviderModule = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, AUTH_PROVIDER_FILE), content);
}

async function stripJsonKeys(path: string, drop: (k: string) => boolean): Promise<void> {
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
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, unknown> } };
    const paths = parsed.compilerOptions?.paths;
    if (paths) for (const a of aliases) delete paths[a];
    await writeFile(path, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    // tsconfig may be absent in partial fixtures
  }
}

/** Manifest-driven removal of every auth provider that was NOT chosen: lib dirs,
 *  their workspace deps + tsconfig aliases, and their app-level controller tests.
 *  Replaces the old regex `removeUnusedAuthStrategies` — no source surgery. */
export async function cleanupUnusedAuth(targetDir: string, chosen: AuthProvider): Promise<void> {
  const providers = Object.keys(MANIFEST.auth) as AuthProvider[];
  for (const p of providers) {
    if (p === chosen) continue;
    const unit = MANIFEST.auth[p];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    for (const t of unit.appTests ?? []) await rm(join(targetDir, t), { force: true });
    const aliases = Object.keys(unit.tsPaths);
    await stripJsonKeys(join(targetDir, 'apps/microservices/auth/package.json'), (k) =>
      aliases.includes(k),
    );
    await stripTsconfigKeys(targetDir, aliases);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -- wire-auth.unit`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/manifest/wire-auth.ts tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts
git commit -m "feat(create-icore): writeAuthProvider + cleanupUnusedAuth (manifest-driven)"
```

---

### Task 4: Wire into the generator + delete `removeUnusedAuthStrategies`

**Files:**

- Modify: `tools/create-icore/src/lib/scaffold.ts`
- Modify: `tools/create-icore/src/lib/scaffold-strip.ts`
- Modify: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`

- [ ] **Step 1: Swap the call in `scaffold.ts`**

Replace the line `await removeUnusedAuthStrategies(opts.targetDir, opts.authProvider);` with:

```ts
await cleanupUnusedAuth(opts.targetDir, opts.authProvider);
await writeAuthProvider(opts.targetDir, opts.authProvider);
```

Add an import near the other manifest imports (Phase 1 added `stripRootProviderDeps` from `./scaffold-strip.js`; the new fns live in the manifest):

```ts
import { cleanupUnusedAuth, writeAuthProvider } from '../manifest/wire-auth.js';
```

Remove `removeUnusedAuthStrategies` from BOTH the `import { ... } from './scaffold-strip.js'` block AND the `export { ... }` re-export block in `scaffold.ts`.

- [ ] **Step 2: Delete `removeUnusedAuthStrategies` from `scaffold-strip.ts`**

Remove the entire `export async function removeUnusedAuthStrategies(...) { ... }` (the supabase/firebase/mongodb branch block, including the `AUTH_BRANCH` regex const declared inside it). Leave `removeUnusedStorageStrategies`, `removeUnusedDbStrategies`, `stripDeps`, `stripTsconfigPath`, `stripRootProviderDeps`, and the rest intact.

- [ ] **Step 3: Remove the obsolete unit test block**

In `scaffold.unit.test.ts`, delete the entire `describe('removeUnusedAuthStrategies', () => { ... })` block (≈ lines 250–446, up to but NOT including `describe('removeUnusedStorageStrategies'`). Also remove `removeUnusedAuthStrategies` from that test file's import list if present. Keep the storage/db describe blocks.

- [ ] **Step 4: Run the generator suite**

Run: `yarn nx test create-icore 2>&1 | tail -12`
Expected: green — `wire-auth` + manifest + remaining strip (storage/db) tests pass; the deleted auth-strip test block is gone.

- [ ] **Step 5: Typecheck/build**

Run: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|scaffold|wire-auth" || echo "builds (ignore uuid DTS)"`
Expected: no errors referencing scaffold/wire-auth (only the pre-existing uuid DTS).

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/src/lib/scaffold.ts tools/create-icore/src/lib/scaffold-strip.ts tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts
git commit -m "feat(create-icore): switch auth axis to blueprint; delete removeUnusedAuthStrategies"
```

---

### Task 5: End-to-end proof — headless generate all 3 auth providers + audit

**Files:** none (verification) + `.changeset/blueprint-phase2a-wire.md`

- [ ] **Step 1: Rebuild the generator + snapshot templates**

Run: `yarn nx build create-icore --skip-nx-cache 2>&1 | tail -3`
(The build runs `snapshot-templates`, copying the updated root `libs/`+`apps/` into the gitignored `templates/`. Ignore the uuid DTS error; JS output is what matters.)

- [ ] **Step 2: Headless-generate each auth provider and audit**

Use the existing headless driver pattern (import `scaffold` from `tools/create-icore/dist/index.js`, pass opts + `tools/create-icore/templates` as templatesDir, `install:false`). Generate three projects to a temp dir — `--auth=supabase`, `--auth=firebase`, `--auth=mongodb` (db/upload matching auth to keep it simple, ui=shadcn, example=none, payment/jobs none, transport tcp) — then for each run the audit CLI:

Run (bash):

```bash
TMP=/tmp/icore-wire-proof && rm -rf "$TMP" && mkdir -p "$TMP"
cat > "$TMP/gen.mjs" <<'EOF'
import { scaffold } from '/home/vladimir-tkach/Projects/22/tools/create-icore/dist/index.js';
const [name, p] = process.argv.slice(2);
await scaffold({ projectName: name, targetDir: `${process.env.TMP}/${name}`,
  authProvider: p, dbProvider: p === 'cloudinary' ? 'supabase' : p, upload: 'none',
  payment: 'none', jobs: 'none', example: 'none', ui: 'shadcn', transport: 'tcp',
  initGit: false, packageManager: 'npm', install: false },
  '/home/vladimir-tkach/Projects/22/tools/create-icore/templates');
console.log('OK', name);
EOF
for p in supabase firebase mongodb; do TMP=$TMP node "$TMP/gen.mjs" "auth-$p" "$p"; done
```

Then for each generated project assert:

- `auth.provider.ts` imports the chosen provider module only.
- No file imports an `@icore/auth-<unchosen>` lib (run the audit CLI: `node tools/create-icore/scripts/audit.mjs "$TMP/auth-firebase"` → `AUDIT OK`).
- Unchosen auth lib dirs absent; unchosen `auth.controller.<p>.integration.unit.test.ts` absent.
- `app.module.ts` is the static version (no `makeXAuth`/`useFactory`).

Record the results in the report. If the audit flags anything, STOP — the cleanup/wiring is incomplete.

- [ ] **Step 3: Changeset**

```md
---
'@idevconn/create-icore': minor
---

Auth axis now uses the additive blueprint: the auth microservice app.module is static and imports a generated auth.provider.ts wiring the one chosen XAuthModule.forRoot. The regex removeUnusedAuthStrategies is deleted; unchosen auth libs/deps/tsconfig-paths/controller-tests are pruned via the manifest. Kills the auth orphan-bug classes by construction.
```

- [ ] **Step 4: Prettier + commit**

```bash
npx prettier --write tools/create-icore/src/manifest apps/microservices/auth/src/app
git add .changeset/blueprint-phase2a-wire.md tools/create-icore apps/microservices/auth
git commit -m "chore(create-icore): blueprint phase 2a-wire changeset + format"
```

---

## Self-Review

**Spec coverage:** Implements §8 phase 4 (switch auth axis, delete `removeUnusedAuthStrategies`) + the §3 composition point "auth app.module imports the one chosen provider DynamicModule" via the generated `auth.provider.ts`. Uses the Phase 2a `XAuthModule`s and the Phase 1 manifest. `blueprint.json` (§10) is NOT in scope here.

**Placeholder scan:** Every code block is complete. The headless proof (Task 5) uses the same `scaffold`-import driver already proven in Phase 1. No TBD.

**Type consistency:** `writeAuthProvider(targetDir, provider: AuthProvider)` and `cleanupUnusedAuth(targetDir, chosen: AuthProvider)` are used identically in the test (Task 3) and the generator wiring (Task 4). `appTests?: string[]` on `Unit` (Task 2) is consumed by `cleanupUnusedAuth`. `MANIFEST.auth[provider].nestModule` (`{importFrom, symbol}`) was defined in Phase 1 and is read by `writeAuthProvider`. The `'AuthStrategy'` token (static app.module ← AuthProviderModule ← XAuthModule export) matches `AuthController`'s `@Inject('AuthStrategy')`.

**Scope:** Auth axis only. Storage/db strips + their app.modules are untouched (later phases). The atomicity note (static app.module + generator switch must ship together) is why this is one PR.
