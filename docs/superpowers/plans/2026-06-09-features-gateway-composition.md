# Features — Additive Gateway Composition (F1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Replace the gateway-side regex source-surgery of `removePaymentStack`/`removeJobsStack`/`removeNotesStack` with generated wiring assembled from manifest feature units — the gateway `app.module.ts` + `main.ts` become static and import generated `features.module.ts` + `gateway-services.ts`.

**Architecture:** Each feature (notes/payment/jobs) is a manifest `Unit` with `gatewayModule` (plain NestJS import), `gatewayService` (transport entry; jobs has none), `libDirs`, `deps`, `tsPaths`, `dockerService` (jobs). `writeFeaturesWiring` writes the two generated files from the CHOSEN set; `cleanupUnusedFeatures` rm's unchosen `libDirs` + strips their gateway deps/tsPaths + the (safe, non-TS) `.env` transport block + docker block. The notes **client tail** (LayoutSider nav + i18n keys — source edits to surviving files) stays behind a reduced `removeNotesClientTail` until the client phase (§7).

**Tech Stack:** TS, NestJS, the create-icore generator. Tests: `yarn nx test create-icore`. Gateway: `yarn nx build api`.

> **Scope note vs spec §2/§3:** F1 makes the **TS** composition points generated (`features.module.ts`, `gateway-services.ts`) — that's the drift/orphan bug class. The `.env` transport (prefix line-filter) and jobs `docker-compose` (yaml) are NOT TS source-surgery and carry no orphan risk; they are KEPT but relocated into `cleanupUnusedFeatures` (parameterized by the manifest), not separately additively generated. Pure-additive transport/docker is deferred (elegance, not correctness).

---

## File Structure

- Modify: `tools/create-icore/src/manifest/types.ts` — add `gatewayModule?` + `dockerService?` to `Unit`
- Modify: `tools/create-icore/src/manifest/index.ts` — populate `MANIFEST.feature`
- Create: `tools/create-icore/src/manifest/wire-features.ts` — `writeFeaturesWiring` + `cleanupUnusedFeatures`
- Create: `apps/api/src/app/features.module.ts` — committed (all 3; generator overwrites)
- Create: `apps/api/src/app/gateway-services.ts` — committed (auth+upload+all 3; generator overwrites)
- Modify: `apps/api/src/app/app.module.ts` — static; import `FeaturesModule`
- Modify: `apps/api/src/main.ts` — import `GATEWAY_SERVICES` from `./app/gateway-services`
- Modify: `tools/create-icore/src/lib/scaffold.ts` — call new wiring; drop the 3 removeXStack calls (notes reduced)
- Modify: `tools/create-icore/src/lib/scaffold-strip.ts` — delete `removePaymentStack`+`removeJobsStack`; reduce `removeNotesStack` → `removeNotesClientTail` (LayoutSider + i18n only)
- Modify: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` — drop tests for the deleted strips; keep/adapt notes-client-tail
- Create: `tools/create-icore/src/manifest/__tests__/wire-features.unit.test.ts`
- Create: `.changeset/blueprint-features-f1.md`

---

### Task 1: `Unit` gains `gatewayModule` + `dockerService`

**Files:** Modify `tools/create-icore/src/manifest/types.ts`.

- [ ] **Step 1: Add the fields** to `interface Unit` (after `clientNav?`):

```ts
  /** A plain NestJS module the gateway app.module imports (no forRoot). */
  gatewayModule?: { importFrom: string; symbol: string };
  /** Name of a docker-compose service block this feature owns. */
  dockerService?: string;
```

- [ ] **Step 2: Typecheck** — `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "manifest/types|TS[0-9]" || echo "types ok"`. Expected: no error referencing types.ts (ignore uuid DTS).

- [ ] **Step 3: Commit** — `git add tools/create-icore/src/manifest/types.ts && git commit -m "feat(create-icore): Unit gains gatewayModule + dockerService"`.

---

### Task 2: Populate `MANIFEST.feature`

**Files:** Modify `tools/create-icore/src/manifest/index.ts`.

- [ ] **Step 1: Replace** the `feature: { notes: EMPTY, payment: EMPTY, jobs: EMPTY },` line with:

```ts
  feature: {
    notes: {
      libDirs: [
        'apps/microservices/notes',
        'apps/microservices/notes-e2e',
        'libs/notes-client',
        'libs/db-strategies',
        'apps/api/src/app/notes',
        'apps/client/src/components/notes',
        'apps/client/src/routes/_dashboard/notes.tsx',
        'apps/client/src/queries/notes.ts',
      ],
      deps: { '@icore/notes-client': '*', '@casl/ability': '^7.0.0' },
      tsPaths: { '@icore/notes-client': ['libs/notes-client/src/index.ts'] },
      gatewayModule: { importFrom: './notes/notes.module', symbol: 'NotesModule' },
      gatewayService: { name: 'notes', prefix: 'NOTES' },
    },
    payment: {
      libDirs: [
        'apps/microservices/payment',
        'apps/microservices/payment-e2e',
        'libs/payment-client',
        'apps/api/src/app/payment',
      ],
      deps: { '@icore/payment-client': '*', '@idevconn/payment': '^1.2.0' },
      tsPaths: { '@icore/payment-client': ['libs/payment-client/src/index.ts'] },
      gatewayModule: { importFrom: './payment/payment.module', symbol: 'PaymentModule' },
      gatewayService: { name: 'payment', prefix: 'PAYMENT' },
    },
    jobs: {
      libDirs: [
        'apps/microservices/jobs',
        'libs/jobs-client',
        'apps/api/src/app/admin',
        'Dockerfile.ms-jobs',
      ],
      deps: {
        '@icore/jobs-client': '*',
        '@bull-board/api': '^7.1.5',
        '@bull-board/express': '^7.1.5',
      },
      tsPaths: { '@icore/jobs-client': ['libs/jobs-client/src/index.ts'] },
      gatewayModule: { importFrom: './admin/admin.module', symbol: 'AdminModule' },
      dockerService: 'jobs',
    },
  },
```

> Verify the dep versions against `apps/api/package.json` before committing (grep `@casl/ability`, `@idevconn/payment`, `@bull-board/api`). Grounding showed `^7.0.0`, `^1.2.0`, `^7.1.5`; if any differ, use the real value. `@icore/*` workspace deps stay `'*'`. Note jobs has NO `gatewayService` (no transport service).

- [ ] **Step 2: Typecheck** `satisfies Manifest` — `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "manifest/index|TS[0-9]" || echo "manifest ok"`.

- [ ] **Step 3: Commit** — `git add tools/create-icore/src/manifest/index.ts && git commit -m "feat(create-icore): populate MANIFEST.feature units"`.

---

### Task 3: `writeFeaturesWiring` + `cleanupUnusedFeatures`

**Files:** Create `tools/create-icore/src/manifest/wire-features.ts` + test.

- [ ] **Step 1: Write the failing test** — `tools/create-icore/src/manifest/__tests__/wire-features.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFeaturesWiring, cleanupUnusedFeatures } from '../wire-features.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const base: CreateIcoreOptions = {
  projectName: 'x',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'paypal',
  jobs: 'bullmq',
  example: 'notes',
  ui: 'shadcn',
  transport: 'tcp',
  packageManager: 'npm',
  initGit: false,
  install: false,
};

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-feat-'));
  await mkdir(join(dir, 'apps/api/src/app'), { recursive: true });
  await mkdir(join(dir, 'apps/microservices/payment'), { recursive: true });
  await writeFile(join(dir, 'apps/microservices/payment/x'), 'x');
  await mkdir(join(dir, 'libs/payment-client'), { recursive: true });
  await writeFile(join(dir, 'libs/payment-client/x'), 'x');
  await writeFile(
    join(dir, 'apps/api/package.json'),
    JSON.stringify({
      name: 'api',
      dependencies: {
        '@icore/notes-client': '*',
        '@icore/payment-client': '*',
        '@icore/jobs-client': '*',
        '@idevconn/payment': '^1.2.0',
        '@casl/ability': '^7.0.0',
        '@bull-board/api': '^7.1.5',
        '@bull-board/express': '^7.1.5',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/notes-client': ['libs/notes-client/src/index.ts'],
          '@icore/payment-client': ['libs/payment-client/src/index.ts'],
          '@icore/jobs-client': ['libs/jobs-client/src/index.ts'],
        },
      },
    }),
  );
  await writeFile(
    join(dir, 'apps/api/.env'),
    'PAYMENT_TRANSPORT=tcp\nPAYMENT_HOST=127.0.0.1\nAUTH_TRANSPORT=tcp\n',
  );
  return dir;
}

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('writeFeaturesWiring', () => {
  it('features.module.ts imports only chosen gateway modules', async () => {
    const dir = await fixture();
    // notes on, payment off, jobs on
    await writeFeaturesWiring(dir, { ...base, targetDir: dir, payment: 'none' });
    const fm = await readFile(join(dir, 'apps/api/src/app/features.module.ts'), 'utf8');
    expect(fm).toContain("import { NotesModule } from './notes/notes.module';");
    expect(fm).toContain("import { AdminModule } from './admin/admin.module';");
    expect(fm).not.toContain('PaymentModule');
    expect(fm).toMatch(/imports:\s*\[NotesModule, AdminModule\]/);
  });

  it('gateway-services.ts lists auth+upload + chosen transport services (jobs excluded)', async () => {
    const dir = await fixture();
    await writeFeaturesWiring(dir, { ...base, targetDir: dir });
    const gs = await readFile(join(dir, 'apps/api/src/app/gateway-services.ts'), 'utf8');
    expect(gs).toContain("{ name: 'auth', prefix: 'AUTH' }");
    expect(gs).toContain("{ name: 'upload', prefix: 'UPLOAD' }");
    expect(gs).toContain("{ name: 'notes', prefix: 'NOTES' }");
    expect(gs).toContain("{ name: 'payment', prefix: 'PAYMENT' }");
    // jobs has no gatewayService
    expect(gs).not.toContain("'jobs'");
  });

  it('omits upload service when upload=none', async () => {
    const dir = await fixture();
    await writeFeaturesWiring(dir, { ...base, targetDir: dir, upload: 'none' });
    const gs = await readFile(join(dir, 'apps/api/src/app/gateway-services.ts'), 'utf8');
    expect(gs).not.toContain("{ name: 'upload', prefix: 'UPLOAD' }");
  });
});

describe('cleanupUnusedFeatures', () => {
  it('rm unchosen feature libDirs + strips their gateway deps/tsPaths + transport block', async () => {
    const dir = await fixture();
    // payment OFF -> its dirs/deps/tsPath/PAYMENT_ env gone; notes+jobs kept
    await cleanupUnusedFeatures(dir, { ...base, targetDir: dir, payment: 'none' });

    expect(await exists(join(dir, 'apps/microservices/payment'))).toBe(false);
    expect(await exists(join(dir, 'libs/payment-client'))).toBe(false);

    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8'));
    expect(pkg.dependencies).not.toHaveProperty('@icore/payment-client');
    expect(pkg.dependencies).not.toHaveProperty('@idevconn/payment');
    expect(pkg.dependencies['@icore/notes-client']).toBe('*'); // notes kept
    expect(pkg.dependencies['@icore/jobs-client']).toBe('*'); // jobs kept

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(ts.compilerOptions.paths).not.toHaveProperty('@icore/payment-client');

    const env = await readFile(join(dir, 'apps/api/.env'), 'utf8');
    expect(env).not.toMatch(/^PAYMENT_/m);
    expect(env).toContain('AUTH_TRANSPORT=tcp'); // untouched
  });
});
```

- [ ] **Step 2: Run → fail** — `yarn nx test create-icore -- wire-features.unit`.

- [ ] **Step 3: Implement** — `tools/create-icore/src/manifest/wire-features.ts`

```ts
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreateIcoreOptions } from '../lib/options.js';
import { MANIFEST } from './index.js';
import { stripGatewayTransport } from '../lib/scaffold-env.js';

const FEATURES_MODULE = 'apps/api/src/app/features.module.ts';
const GATEWAY_SERVICES = 'apps/api/src/app/gateway-services.ts';
const API_PKG = 'apps/api/package.json';

type FeatureKey = 'notes' | 'payment' | 'jobs';

/** Which features are selected, from the options. */
function selectedFeatures(opts: CreateIcoreOptions): FeatureKey[] {
  const out: FeatureKey[] = [];
  if (opts.example === 'notes') out.push('notes');
  if (opts.payment !== 'none') out.push('payment');
  if (opts.jobs !== 'none') out.push('jobs');
  return out;
}

/** features.module.ts (gateway imports) + gateway-services.ts (transport services). */
export async function writeFeaturesWiring(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const chosen = selectedFeatures(opts);

  // features.module.ts — import + @Module of chosen gateway feature modules.
  const mods = chosen
    .map((k) => MANIFEST.feature[k].gatewayModule)
    .filter((m): m is NonNullable<typeof m> => !!m);
  const imports = mods.map((m) => `import { ${m.symbol} } from '${m.importFrom}';`).join('\n');
  const symbols = mods.map((m) => m.symbol).join(', ');
  const featuresModule =
    `import { Module } from '@nestjs/common';\n` +
    (imports ? imports + '\n' : '') +
    `\n@Module({\n  imports: [${symbols}],\n})\nexport class FeaturesModule {}\n`;
  await writeFile(join(targetDir, FEATURES_MODULE), featuresModule);

  // gateway-services.ts — auth (always) + upload (unless none) + chosen feature services.
  const services: { name: string; prefix: string }[] = [{ name: 'auth', prefix: 'AUTH' }];
  if (opts.upload !== 'none') services.push({ name: 'upload', prefix: 'UPLOAD' });
  for (const k of chosen) {
    const svc = MANIFEST.feature[k].gatewayService;
    if (svc) services.push(svc);
  }
  const entries = services.map((s) => `  { name: '${s.name}', prefix: '${s.prefix}' },`).join('\n');
  const gatewayServices =
    `/** Microservices the gateway proxies. Generated by create-icore. */\n` +
    `export const GATEWAY_SERVICES = [\n${entries}\n];\n`;
  await writeFile(join(targetDir, GATEWAY_SERVICES), gatewayServices);
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
    // pkg absent in partial fixtures
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
    // tsconfig absent in partial fixtures
  }
}

async function stripJobsDockerCompose(targetDir: string): Promise<void> {
  const composePath = join(targetDir, 'docker-compose.yml');
  try {
    const compose = await readFile(composePath, 'utf8');
    const next = compose
      .replace(/\n {2}jobs:[\s\S]+?(?=\n {2}\w+:|\nnetworks:)/m, '\n')
      .replace(/\n {6}jobs:\n {8}condition: service_started/g, '')
      .replace(/\n {6}JOBS_REDIS_URL:[^\n]*/g, '');
    await writeFile(composePath, next);
  } catch {
    // ignore
  }
}

/** Remove every NOT-selected feature: its dirs, gateway deps + tsconfig aliases,
 *  its gateway .env transport block, and (jobs) its docker-compose service. The
 *  gateway app.module / main.ts are NOT touched — they consume the generated
 *  features.module.ts / gateway-services.ts. */
export async function cleanupUnusedFeatures(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const chosen = new Set(selectedFeatures(opts));
  for (const key of ['notes', 'payment', 'jobs'] as FeatureKey[]) {
    if (chosen.has(key)) continue;
    const unit = MANIFEST.feature[key];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    const dropKeys = new Set([...Object.keys(unit.tsPaths), ...Object.keys(unit.deps)]);
    await stripJsonKeys(join(targetDir, API_PKG), (k) => dropKeys.has(k));
    await stripTsconfigKeys(targetDir, Object.keys(unit.tsPaths));
    if (unit.gatewayService) await stripGatewayTransport(targetDir, unit.gatewayService.prefix);
    if (unit.dockerService === 'jobs') await stripJobsDockerCompose(targetDir);
  }
}
```

> `@casl/ability` is in notes' `deps` — it is stripped from `apps/api/package.json` when notes is unchosen (mirrors the old `removeNotesStack`). Verify `MANIFEST.feature[key]` indexing typechecks (the manifest `feature` value is a fixed-key object; cast `MANIFEST.feature` to `Record<FeatureKey, Unit>` locally if TS complains).

- [ ] **Step 4: Run → pass** — `yarn nx test create-icore -- wire-features.unit` (5 tests).

- [ ] **Step 5: Commit** — `feat(create-icore): writeFeaturesWiring + cleanupUnusedFeatures`.

---

### Task 4: Static gateway files (iCore self)

**Files:** Create `apps/api/src/app/features.module.ts` + `apps/api/src/app/gateway-services.ts`; modify `apps/api/src/app/app.module.ts` + `apps/api/src/main.ts`.

- [ ] **Step 1: Committed `features.module.ts`** (iCore ships all three):

```ts
import { Module } from '@nestjs/common';
import { NotesModule } from './notes/notes.module';
import { PaymentModule } from './payment/payment.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [NotesModule, PaymentModule, AdminModule],
})
export class FeaturesModule {}
```

- [ ] **Step 2: Committed `gateway-services.ts`:**

```ts
/** Microservices the gateway proxies. Generated by create-icore. */
export const GATEWAY_SERVICES = [
  { name: 'auth', prefix: 'AUTH' },
  { name: 'upload', prefix: 'UPLOAD' },
  { name: 'notes', prefix: 'NOTES' },
  { name: 'payment', prefix: 'PAYMENT' },
];
```

- [ ] **Step 3: Static `app.module.ts`** — replace the feature imports + flat list with `FeaturesModule`:

```ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { AbilitiesModule } from './abilities/abilities.module';
import { StorageModule } from './storage/storage.module';
import { FeaturesModule } from './features.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), 'apps/api/.env'), join(process.cwd(), '.env')],
    }),
    ThrottlerModule.forRoot([{ name: 'auth-burst', ttl: seconds(60), limit: 10 }]),
    AuthModule,
    AbilitiesModule,
    ProfileModule,
    StorageModule,
    FeaturesModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: `main.ts`** — replace the inline `const GATEWAY_SERVICES = [...]` with an import. Add near the other imports: `import { GATEWAY_SERVICES } from './app/gateway-services';` and DELETE the inline `const GATEWAY_SERVICES = [ { name: 'auth', ... }, { name: 'upload', ... } ];` declaration. Everything else in main.ts unchanged.

- [ ] **Step 5: Verify iCore gateway builds + tests**

Run: `yarn nx build api 2>&1 | tail -5` → green.
Run: `yarn nx test api 2>&1 | tail -6` → green (if api has unit tests; else skip).

- [ ] **Step 6: Commit** — `git add apps/api/src/app/features.module.ts apps/api/src/app/gateway-services.ts apps/api/src/app/app.module.ts apps/api/src/main.ts && git commit -m "refactor(api): static app.module + generated features.module/gateway-services"`.

---

### Task 5: Wire generator + delete payment/jobs strips + reduce notes strip

**Files:** Modify `scaffold.ts`, `scaffold-strip.ts`, `__tests__/scaffold.unit.test.ts`.

- [ ] **Step 1: `scaffold.ts`** — replace these four lines:

```ts
if (opts.upload === 'none') await removeUploadStack(opts.targetDir);
if (opts.payment === 'none') await removePaymentStack(opts.targetDir);
if (opts.jobs === 'none') await removeJobsStack(opts.targetDir);
if (opts.example === 'none') await removeNotesStack(opts.targetDir);
```

with:

```ts
if (opts.upload === 'none') await removeUploadStack(opts.targetDir);
await cleanupUnusedFeatures(opts.targetDir, opts);
await writeFeaturesWiring(opts.targetDir, opts);
// Notes client tail (LayoutSider nav + i18n keys — edits to surviving files)
// still stripped here until the client phase replaces it with nav.config.
if (opts.example === 'none') await removeNotesClientTail(opts.targetDir);
```

Add `import { cleanupUnusedFeatures, writeFeaturesWiring } from '../manifest/wire-features.js';`. Remove `removePaymentStack`, `removeJobsStack`, `removeNotesStack` from the `import`/`export` blocks; add `removeNotesClientTail` to them.

- [ ] **Step 2: `scaffold-strip.ts`** — delete `removePaymentStack` and `removeJobsStack` entirely. Replace `removeNotesStack` with a reduced `removeNotesClientTail` that keeps ONLY the LayoutSider + i18n-keys edits (the dir removals + gateway/transport now live in `cleanupUnusedFeatures`):

```ts
/** Notes' CLIENT-side source edits to files that survive (LayoutSider nav + i18n
 *  keys). Temporary until the client phase replaces it with a generated nav.config.
 *  Dir removals + gateway/transport cleanup live in cleanupUnusedFeatures. */
export async function removeNotesClientTail(targetDir: string): Promise<void> {
  const siderPath = join(targetDir, 'apps/client/src/components/layout/LayoutSider.tsx');
  try {
    const src = await readFile(siderPath, 'utf8');
    const next = src
      .replace(', StickyNote', '')
      .replace(/\n {8}<Link\n {10}to="\/(?:_dashboard\/)?notes"[\s\S]*?<\/Link>/, '')
      .replace(', FileTextOutlined', '')
      .replace(
        "const selectedKey = pathname.includes('/notes')\n    ? 'notes'\n    : pathname.includes('/profile')",
        "const selectedKey = pathname.includes('/profile')",
      )
      .replace(
        /\n {4}\{\n {6}key: 'notes',\n {6}icon: <FileTextOutlined \/>,\n {6}label: <Link to="\/(?:_dashboard\/)?notes">\{t\('notes\.title'\)\}<\/Link>,\n {4}\},/,
        '',
      )
      .replace("import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';\n", '')
      .replace(
        /\n {8}<ListItemButton\n {10}component=\{Link\}\n {10}to="\/(?:_dashboard\/)?notes"[\s\S]*?<\/ListItemButton>/,
        '',
      )
      .replace(/\n\s*<Link to="\/(?:_dashboard\/)?notes">[\s\S]*?<\/Link>/m, '');
    await writeFile(siderPath, next);
  } catch {
    // ignore
  }
  const keysPath = join(targetDir, 'libs/template-shared/src/lib/i18n/keys.ts');
  try {
    const src = await readFile(keysPath, 'utf8');
    const next = src.replace(/^\s{4}notes: \{\n(?:\s+.*\n)*?\s{4}\},\n/m, '');
    await writeFile(keysPath, next);
  } catch {
    // ignore
  }
}
```

(Keep the `readFile`/`writeFile`/`join` imports — still used by `removeUploadStack`/`removeFirebaseAdminLib`/`stripDeps`.)

- [ ] **Step 3: `scaffold.unit.test.ts`** — delete the `describe('removePaymentStack'…)`, `describe('removeJobsStack'…)`, and `describe('removeNotesStack'…)` blocks (if present). Add a small `describe('removeNotesClientTail'…)` test asserting it strips `StickyNote` + the notes `<Link>` from a shadcn LayoutSider fixture and leaves the rest. (If those describe blocks don't exist in this file, skip — just remove any now-broken imports of the deleted symbols.)

- [ ] **Step 4: Run** `yarn nx test create-icore 2>&1 | tail -12` → green. Build: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|wire-features|scaffold" || echo "ok (ignore uuid DTS)"`.

- [ ] **Step 5: Commit** — `feat(create-icore): switch features to additive gateway wiring; delete payment/jobs strips, reduce notes strip`.

---

### Task 6: E2E proof + lockfile + changeset

- [ ] **Step 1: Rebuild + snapshot** — `yarn nx build create-icore --skip-nx-cache 2>&1 | tail -3` (ignore uuid DTS).

- [ ] **Step 2: Headless-generate feature combos + audit**

```bash
T=/tmp/icore-feat && rm -rf "$T" && mkdir -p "$T"
cat > "$T/gen.mjs" <<'EOF'
import { scaffold } from '/home/vladimir-tkach/Projects/22/tools/create-icore/dist/index.js';
const [ex, pay, jb] = process.argv.slice(2);
await scaffold({ projectName: `f-${ex}-${pay}-${jb}`, targetDir: `${process.env.T}/f-${ex}-${pay}-${jb}`,
  authProvider:'supabase', dbProvider:'supabase', upload:'supabase',
  payment: pay, jobs: jb, example: ex, ui:'shadcn', transport:'tcp',
  initGit:false, packageManager:'npm', install:false },
  '/home/vladimir-tkach/Projects/22/tools/create-icore/templates');
console.log('gen', ex, pay, jb);
EOF
# all on
T=$T node "$T/gen.mjs" notes paypal bullmq
# all off (payment=none, jobs=none, example=none)
T=$T node "$T/gen.mjs" none none none
for d in "$T"/f-*; do
  echo "=== $d ==="
  node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$d" && echo "AUDIT OK"
  echo "features.module imports:"; grep -E "Module" "$d/apps/api/src/app/features.module.ts"
  echo "gateway-services:"; grep -E "name:" "$d/apps/api/src/app/gateway-services.ts"
  echo "app.module has makeXStack regex artifacts? (expect none):"; grep -cE "NotesModule|PaymentModule|AdminModule" "$d/apps/api/src/app/app.module.ts"
done
```

Assert: all-on → `features.module.ts` imports Notes+Payment+Admin, gateway-services has auth/upload/notes/payment (not jobs), `AUDIT OK`, unchosen dirs present (all chosen). all-off → `features.module.ts` `imports: []`, gateway-services = auth+upload only, `apps/microservices/{notes,payment,jobs}` + `apps/api/src/app/{notes,payment,admin}` absent, gateway `package.json` has no `@icore/{notes,payment,jobs}-client`/`@idevconn/payment`/`@bull-board/*`/`@casl/ability`, `AUDIT OK`. The static `app.module.ts` always reads `imports: [...AuthModule…, FeaturesModule]` (count of NotesModule/PaymentModule/AdminModule in app.module.ts == 0). If any audit flags an orphan, STOP + fix.

- [ ] **Step 3: Lockfile** — F1 doesn't add deps (it removes). No `yarn install` needed unless a generated project's package.json changed at the iCore root; confirm `git status --short yarn.lock` is clean. If dirty, `yarn install` + include it.

- [ ] **Step 4: Changeset** — `.changeset/blueprint-features-f1.md`:

```md
---
'@idevconn/create-icore': minor
---

Features (notes/payment/jobs) gateway composition is now additive: the gateway app.module + main.ts are static and import a generated features.module.ts + gateway-services.ts assembled from the chosen feature set. The regex removePaymentStack/removeJobsStack are deleted and removeNotesStack is reduced to its client-only tail (LayoutSider + i18n, pending the client phase). Unchosen feature dirs/deps/tsconfig/transport/docker are pruned via the manifest — no gateway source-surgery.
```

- [ ] **Step 5: Prettier + commit** — `npx prettier --write tools/create-icore/src/manifest apps/api/src/app apps/api/src/main.ts && git add .changeset/blueprint-features-f1.md tools/create-icore apps/api && git commit -m "chore(create-icore): features F1 changeset + format"`.

---

## Self-Review

**Spec coverage:** §1 manifest units → Tasks 1-2. §2 generated `features.module.ts`/`gateway-services.ts` + cleanup → Tasks 3-4. §3 delete payment/jobs strips + reduce notes → Task 5. §4 scaffold.ts flow → Task 5. §5 testing → Tasks 3,6. Scope note: `.env` transport + jobs docker are kept as safe config-filtering inside `cleanupUnusedFeatures` (not separately additively generated) — a deliberate refinement of spec §2's "additive transport/docker", since neither is the TS-source-surgery bug class. The notes client tail (LayoutSider/i18n) stays in `removeNotesClientTail` per spec §3 (client phase owns it later).

**Placeholder scan:** dep versions carry a "verify against apps/api/package.json" instruction; the `MANIFEST.feature[key]` index cast is flagged. No TBD. The notes-client-tail regex is quoted verbatim from the current `removeNotesStack`.

**Type consistency:** `writeFeaturesWiring(targetDir, opts)` + `cleanupUnusedFeatures(targetDir, opts)` used identically in test + scaffold.ts. `selectedFeatures` is the single source of "which features on". `MANIFEST.feature[k].gatewayModule`/`.gatewayService` match the Task-1 `Unit` additions + Task-2 data. `FeaturesModule` + `GATEWAY_SERVICES` names match between generated output (Task 3), committed files (Task 4), and the static app.module/main.ts consumers.

**Scope:** F1 = gateway-side only. Client tail, transport axis, pure-additive copy, blueprint.json are out (later phases).
