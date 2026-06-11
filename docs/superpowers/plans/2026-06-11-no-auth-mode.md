# No-Auth Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `authProvider = 'none'` option to `create-icore`, scaffolding a minimal Nx monorepo (gateway shell + React client) with no login, no auth MS, no AuthGuard.

**Architecture:** Extend `AuthProvider` type with `'none'`; in `scaffold()` branch to `removeAuthStack()` instead of `writeAuthProvider()`. Pattern mirrors existing `upload = 'none'` → `removeUploadStack()`. `collectOptions` cascades db/example to `'none'` and skips the transport question when no microservices exist.

**Tech Stack:** TypeScript, Vitest, Node.js fs/promises, `@clack/prompts`.

---

## File Map

| File | Change |
|------|--------|
| `tools/create-icore/src/lib/options.ts` | Add `AuthBackend`, widen `AuthProvider`, widen `DbProvider` |
| `tools/create-icore/src/lib/config.ts` | Add `'none'` to `AUTH_PROVIDERS`, `DB_PROVIDERS` |
| `tools/create-icore/src/manifest/wire-auth.ts` | Narrow param types from `AuthProvider` → `AuthBackend` |
| `tools/create-icore/src/lib/prompts.ts` | Add `'none'` to auth select; cascade db/example; skip transport when no MS |
| `tools/create-icore/src/manifest/wire-features.ts` | Guard auth entry in `gateway-services.ts` |
| `tools/create-icore/src/lib/scaffold-strip.ts` | Add `removeAuthStack()` |
| `tools/create-icore/src/lib/scaffold.ts` | Guard `writeAuthEnv`; branch auth≠none vs `removeAuthStack` |
| `tools/create-icore/src/lib/__tests__/config.unit.test.ts` | Tests: `validateConfig` accepts `auth:'none'`, `db:'none'` |
| `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts` | Test: `--auth=none` parse |
| `tools/create-icore/src/manifest/__tests__/wire-features.unit.test.ts` | Test: `gateway-services.ts` omits auth when `authProvider='none'` |
| `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` | Tests: `removeAuthStack` deletes dirs, strips files |
| `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts` | Test: `scaffold()` with `authProvider='none'` |
| `.changeset/no-auth-mode.md` | Changeset (minor) |

---

## Task 1: Type Foundation + config.ts

**Files:**
- Modify: `tools/create-icore/src/lib/options.ts`
- Modify: `tools/create-icore/src/lib/config.ts`
- Modify: `tools/create-icore/src/manifest/wire-auth.ts`
- Test: `tools/create-icore/src/lib/__tests__/config.unit.test.ts`

- [ ] **Step 1: Write failing tests for `validateConfig` with `'none'`**

Add to the `describe('validateConfig')` block in `tools/create-icore/src/lib/__tests__/config.unit.test.ts`:

```ts
it('accepts authProvider: "none"', () => {
  expect(validateConfig({ authProvider: 'none' })).toEqual({ authProvider: 'none' });
});

it('accepts dbProvider: "none"', () => {
  expect(validateConfig({ dbProvider: 'none' })).toEqual({ dbProvider: 'none' });
});

it('error message for invalid authProvider lists none as valid', () => {
  expect(() => validateConfig({ authProvider: 'oracle' })).toThrowError(
    'expected one of: supabase, firebase, mongodb, none',
  );
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
yarn nx test create-icore --testFile=src/lib/__tests__/config.unit.test.ts
```

Expected: FAIL — `'none'` not in `AUTH_PROVIDERS` validation list.

- [ ] **Step 3: Update `options.ts`**

Replace the current `AuthProvider` and `DbProvider` type lines in `tools/create-icore/src/lib/options.ts`:

```ts
export type AuthBackend = 'supabase' | 'firebase' | 'mongodb';
export type AuthProvider = AuthBackend | 'none';
export type DbProvider = 'supabase' | 'firebase' | 'mongodb' | 'none';
```

`CreateIcoreOptions` fields `authProvider` and `dbProvider` automatically pick up the wider types — no other change needed in that interface.

- [ ] **Step 4: Update `config.ts`**

In `tools/create-icore/src/lib/config.ts`, update the two const arrays:

```ts
const AUTH_PROVIDERS: readonly AuthProvider[] = ['supabase', 'firebase', 'mongodb', 'none'];
const DB_PROVIDERS: readonly DbProvider[] = ['supabase', 'firebase', 'mongodb', 'none'];
```

- [ ] **Step 5: Update `wire-auth.ts`**

In `tools/create-icore/src/manifest/wire-auth.ts`, change the import and function signatures so `'none'` can never be passed at the type level:

```ts
import type { AuthBackend } from '../lib/options.js';
import { MANIFEST } from './index.js';
import type { Unit } from './types.js';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from './wire-provider.js';

const AUTH: AxisWiring = {
  section: MANIFEST.auth as Record<string, Unit>,
  providerFile: 'apps/microservices/auth/src/app/auth.provider.ts',
  exportConst: 'AuthProviderModule',
  msPackageJson: 'apps/microservices/auth/package.json',
  envPath: 'apps/microservices/auth/.env',
};

export const writeAuthProvider = (targetDir: string, provider: AuthBackend): Promise<void> =>
  writeProvider(targetDir, AUTH, provider);

export const cleanupUnusedAuth = (targetDir: string, chosen: AuthBackend): Promise<void> =>
  cleanupUnusedAxis(targetDir, AUTH, chosen);
```

- [ ] **Step 6: Run tests — expect pass**

```bash
yarn nx test create-icore --testFile=src/lib/__tests__/config.unit.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Build to confirm TypeScript compiles**

```bash
yarn nx build create-icore
```

Expected: green build, no type errors.

- [ ] **Step 8: Commit**

```bash
git add tools/create-icore/src/lib/options.ts \
        tools/create-icore/src/lib/config.ts \
        tools/create-icore/src/manifest/wire-auth.ts \
        tools/create-icore/src/lib/__tests__/config.unit.test.ts
git commit -m "feat(create-icore): add AuthBackend type and 'none' to AuthProvider/DbProvider"
```

---

## Task 2: collectOptions Wizard Cascade

**Files:**
- Modify: `tools/create-icore/src/lib/prompts.ts`
- Test: `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`

- [ ] **Step 1: Write failing test for `--auth=none` flag**

Add to `describe('parseFlags')` in `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`:

```ts
it('reads --auth=none', () => {
  expect(parseFlags(['my-app', '--auth=none']).authProvider).toBe('none');
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
yarn nx test create-icore --testFile=src/lib/__tests__/prompts.unit.test.ts
```

Expected: FAIL — `'none'` not accepted (TypeScript might actually pass it through at runtime since `parseFlags` casts the raw string; if it passes, add a TypeScript-level check or move on).

Note: `parseFlags` already does `out.authProvider = v as AuthProvider` — with `AuthProvider` now including `'none'`, this test will actually PASS already. If it does, that's fine — continue to implement the cascade.

- [ ] **Step 3: Implement cascade in `collectOptions`**

In `tools/create-icore/src/lib/prompts.ts`, make these changes to `collectOptions`:

**a) Update the auth select options** — add the `'none'` entry:

```ts
const authProvider =
  flags.authProvider ??
  ((await p.select({
    message: 'Auth provider',
    options: [
      { value: 'supabase', label: 'Supabase' },
      { value: 'firebase', label: 'Firebase' },
      { value: 'mongodb', label: 'MongoDB (Custom Auth)' },
      { value: 'none', label: 'None — no login, open API (simple SPA)' },
    ],
  })) as AuthProvider);
if (p.isCancel(authProvider)) throw new Error('cancelled');
```

**b) Replace the `dbProvider` prompt block** — skip when `authProvider === 'none'`:

```ts
const dbProvider: DbProvider =
  authProvider === 'none'
    ? 'none'
    : flags.dbProvider ??
      ((await p.select({
        message: 'Database backend',
        options: [
          { value: 'supabase', label: 'Supabase Postgres' },
          { value: 'firebase', label: 'Firestore' },
          { value: 'mongodb', label: 'MongoDB' },
        ],
        initialValue: authProvider as DbProvider,
      })) as DbProvider);
if (p.isCancel(dbProvider)) throw new Error('cancelled');
```

**c) Replace the `example` prompt block** — skip when `authProvider === 'none'`:

```ts
const example: ExampleMode =
  authProvider === 'none'
    ? 'none'
    : flags.example ??
      ((await p.select({
        message: 'Include notes sample feature? (CRUD demo — remove before production)',
        options: [
          { value: 'notes' as ExampleMode, label: 'Yes — include notes sample' },
          { value: 'none' as ExampleMode, label: 'No — skip notes (clean slate)' },
        ],
        initialValue: 'notes' as ExampleMode,
      })) as ExampleMode);
if (p.isCancel(example)) throw new Error('cancelled');
```

**d) Replace the `transport` prompt block** — skip when no MS exists:

```ts
const noMicroservices = authProvider === 'none' && upload === 'none' && payment === 'none';
const transport: MsTransport =
  flags.transport ??
  (noMicroservices
    ? 'tcp'
    : ((await p.select({
        message: 'Microservice transport',
        options: [
          { value: 'tcp' as MsTransport, label: 'TCP (default, no broker required)' },
          { value: 'redis' as MsTransport, label: 'Redis' },
          { value: 'nats' as MsTransport, label: 'NATS' },
          { value: 'mqtt' as MsTransport, label: 'MQTT' },
          { value: 'rmq' as MsTransport, label: 'RabbitMQ' },
          { value: 'kafka' as MsTransport, label: 'Kafka' },
        ],
        initialValue: 'tcp' as MsTransport,
      })) as MsTransport));
if (p.isCancel(transport)) throw new Error('cancelled');
```

Also add the `DbProvider` import to the type imports at the top if not already there:
```ts
import type {
  AuthProvider,
  DbProvider,
  ...
} from './options.js';
```

And update the `AuthBackend` import — `AuthProvider` is still the type here since the select returns it.

- [ ] **Step 4: Run tests — expect pass**

```bash
yarn nx test create-icore --testFile=src/lib/__tests__/prompts.unit.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Build**

```bash
yarn nx build create-icore
```

Expected: green, no type errors.

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/src/lib/prompts.ts \
        tools/create-icore/src/lib/__tests__/prompts.unit.test.ts
git commit -m "feat(create-icore): cascade db/example/transport when authProvider=none"
```

---

## Task 3: `writeFeaturesWiring` Auth Guard

**Files:**
- Modify: `tools/create-icore/src/manifest/wire-features.ts`
- Test: `tools/create-icore/src/manifest/__tests__/wire-features.unit.test.ts`

- [ ] **Step 1: Write failing test**

Add to `describe('writeFeaturesWiring')` in `tools/create-icore/src/manifest/__tests__/wire-features.unit.test.ts`:

```ts
it('gateway-services.ts omits auth entry when authProvider is none', async () => {
  const dir = await fixture();
  await writeFeaturesWiring(dir, {
    ...base,
    targetDir: dir,
    authProvider: 'none',
    dbProvider: 'none',
    example: 'none',
    payment: 'none',
    jobs: 'none',
    upload: 'supabase',
  });
  const gs = await readFile(
    join(dir, 'apps/api/src/app/gateway-services.ts'),
    'utf8',
  );
  expect(gs).not.toContain("name: 'auth'");
  expect(gs).toContain("name: 'upload'");
});

it('gateway-services.ts includes auth entry when authProvider is supabase', async () => {
  const dir = await fixture();
  await writeFeaturesWiring(dir, {
    ...base,
    targetDir: dir,
    payment: 'none',
    jobs: 'none',
    example: 'none',
  });
  const gs = await readFile(
    join(dir, 'apps/api/src/app/gateway-services.ts'),
    'utf8',
  );
  expect(gs).toContain("name: 'auth'");
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
yarn nx test create-icore --testFile=src/manifest/__tests__/wire-features.unit.test.ts
```

Expected: FAIL — auth entry always present.

- [ ] **Step 3: Guard auth entry in `writeFeaturesWiring`**

In `tools/create-icore/src/manifest/wire-features.ts`, find the `services` array construction (around line 46) and guard the auth entry:

```ts
// gateway-services.ts — auth (unless none) + upload (unless none) + chosen feature services.
const services: { name: string; prefix: string }[] = [];
if (opts.authProvider !== 'none') services.push({ name: 'auth', prefix: 'AUTH' });
if (opts.upload !== 'none') services.push({ name: 'upload', prefix: 'UPLOAD' });
for (const k of chosen) {
  const svc = FEATURES[k].gatewayService;
  if (svc) services.push(svc);
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
yarn nx test create-icore --testFile=src/manifest/__tests__/wire-features.unit.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/manifest/wire-features.ts \
        tools/create-icore/src/manifest/__tests__/wire-features.unit.test.ts
git commit -m "feat(create-icore): omit auth entry in gateway-services.ts when authProvider=none"
```

---

## Task 4: `removeAuthStack()`

**Files:**
- Modify: `tools/create-icore/src/lib/scaffold-strip.ts`
- Test: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`

- [ ] **Step 1: Write failing tests for `removeAuthStack`**

Add the following to `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`. First, add `removeAuthStack` to the import from `'../scaffold.js'` and add `access` to the node:fs/promises import. Then add this describe block:

```ts
import { ..., removeAuthStack } from '../scaffold.js';

// add `access` to the node:fs/promises import
import { ..., access } from 'node:fs/promises';

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('removeAuthStack', () => {
  let authDir: string;

  beforeEach(async () => {
    authDir = await mkdtemp(join(tmpdir(), 'icore-no-auth-'));

    // Dirs that should be deleted
    await mkdir(join(authDir, 'apps/microservices/auth/src'), { recursive: true });
    await writeFile(join(authDir, 'apps/microservices/auth/src/main.ts'), '');
    await mkdir(join(authDir, 'libs/auth-strategies/supabase'), { recursive: true });
    await writeFile(join(authDir, 'libs/auth-strategies/supabase/index.ts'), '');
    await mkdir(join(authDir, 'libs/auth-client/src'), { recursive: true });
    await writeFile(join(authDir, 'libs/auth-client/src/index.ts'), '');
    await mkdir(join(authDir, 'apps/api/src/app/auth'), { recursive: true });
    await writeFile(join(authDir, 'apps/api/src/app/auth/auth.module.ts'), '');
    await mkdir(join(authDir, 'apps/api/src/app/profile'), { recursive: true });
    await writeFile(join(authDir, 'apps/api/src/app/profile/profile.controller.ts'), '');
    await mkdir(join(authDir, 'apps/api/src/app/abilities'), { recursive: true });
    await writeFile(join(authDir, 'apps/api/src/app/abilities/ability.guard.ts'), '');
    await mkdir(join(authDir, 'apps/client/src/components/auth'), { recursive: true });
    await writeFile(join(authDir, 'apps/client/src/components/auth/LoginForm.tsx'), '');
    await mkdir(join(authDir, 'apps/client/src/routes/_dashboard'), { recursive: true });
    await writeFile(join(authDir, 'apps/client/src/routes/login.tsx'), '');
    await writeFile(join(authDir, 'apps/client/src/routes/auth.callback.tsx'), '');
    await writeFile(join(authDir, 'apps/client/src/routes/auth.oauth.callback.tsx'), '');
    await writeFile(join(authDir, 'apps/client/src/routes/_dashboard/profile.tsx'), '');
    await writeFile(join(authDir, 'Dockerfile.ms-auth'), '');

    // app.module.ts
    await writeFile(
      join(authDir, 'apps/api/src/app/app.module.ts'),
      [
        "import { AuthModule } from './auth/auth.module';",
        "import { ProfileModule } from './profile/profile.module';",
        "import { AbilitiesModule } from './abilities/abilities.module';",
        "import { FeaturesModule } from './features.module';",
        "@Module({ imports: [AuthModule, ProfileModule, AbilitiesModule, FeaturesModule] })",
        "export class AppModule {}",
      ].join('\n'),
    );

    // _dashboard.tsx
    await writeFile(
      join(authDir, 'apps/client/src/routes/_dashboard.tsx'),
      [
        "import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';",
        "import { useAuthStore } from '@icore/template-shared';",
        "import { MainLayout } from '../layouts/MainLayout';",
        "",
        "export const Route = createFileRoute('/_dashboard')({",
        "  beforeLoad: () => {",
        "    if (!useAuthStore.getState().accessToken) {",
        "      throw redirect({ to: '/login' });",
        "    }",
        "  },",
        "  component: () => (",
        "    <MainLayout>",
        "      <Outlet />",
        "    </MainLayout>",
        "  ),",
        "});",
      ].join('\n'),
    );

    // tsconfig.base.json
    await writeFile(
      join(authDir, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@icore/auth-client': ['libs/auth-client/src/index.ts'],
            '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'],
            '@icore/auth-firebase': ['libs/auth-strategies/firebase/src/index.ts'],
            '@icore/auth-mongodb': ['libs/auth-strategies/mongodb/src/index.ts'],
            '@icore/upload-client': ['libs/upload-client/src/index.ts'],
          },
        },
      }),
    );

    // api package.json
    await writeFile(
      join(authDir, 'apps/api/package.json'),
      JSON.stringify({
        name: 'api',
        dependencies: {
          '@icore/auth-client': '*',
          '@icore/upload-client': '*',
        },
      }),
    );

    // gateway .env
    await writeFile(
      join(authDir, 'apps/api/.env'),
      'AUTH_TRANSPORT=tcp\nAUTH_HOST=127.0.0.1\nUPLOAD_TRANSPORT=tcp\n',
    );

    // docker-compose.yml
    await writeFile(
      join(authDir, 'docker-compose.yml'),
      [
        'services:',
        '  auth:',
        '    build:',
        '      context: .',
        '      dockerfile: Dockerfile.ms-auth',
        '    restart: unless-stopped',
        '  gateway:',
        '    environment:',
        '      API_PORT: 3001',
        '      AUTH_TRANSPORT: redis',
        '      AUTH_REDIS_URL: redis://redis:6379',
        '    depends_on:',
        '      redis:',
        '        condition: service_healthy',
        '      auth:',
        '        condition: service_started',
        'networks:',
        '  icore:',
        '    driver: bridge',
      ].join('\n'),
    );
  });

  it('removes auth MS, strategy libs, auth-client, and gateway auth dirs', async () => {
    await removeAuthStack(authDir);
    expect(await exists(join(authDir, 'apps/microservices/auth'))).toBe(false);
    expect(await exists(join(authDir, 'libs/auth-strategies'))).toBe(false);
    expect(await exists(join(authDir, 'libs/auth-client'))).toBe(false);
    expect(await exists(join(authDir, 'apps/api/src/app/auth'))).toBe(false);
    expect(await exists(join(authDir, 'apps/api/src/app/profile'))).toBe(false);
    expect(await exists(join(authDir, 'apps/api/src/app/abilities'))).toBe(false);
    expect(await exists(join(authDir, 'Dockerfile.ms-auth'))).toBe(false);
  });

  it('removes client auth routes and components', async () => {
    await removeAuthStack(authDir);
    expect(await exists(join(authDir, 'apps/client/src/components/auth'))).toBe(false);
    expect(await exists(join(authDir, 'apps/client/src/routes/login.tsx'))).toBe(false);
    expect(await exists(join(authDir, 'apps/client/src/routes/auth.callback.tsx'))).toBe(false);
    expect(await exists(join(authDir, 'apps/client/src/routes/auth.oauth.callback.tsx'))).toBe(false);
    expect(await exists(join(authDir, 'apps/client/src/routes/_dashboard/profile.tsx'))).toBe(false);
  });

  it('strips AuthModule, ProfileModule, AbilitiesModule from app.module.ts', async () => {
    await removeAuthStack(authDir);
    const content = await readFile(join(authDir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(content).not.toContain('AuthModule');
    expect(content).not.toContain('ProfileModule');
    expect(content).not.toContain('AbilitiesModule');
    expect(content).toContain('FeaturesModule');
  });

  it('strips beforeLoad, useAuthStore, and redirect from _dashboard.tsx', async () => {
    await removeAuthStack(authDir);
    const content = await readFile(
      join(authDir, 'apps/client/src/routes/_dashboard.tsx'),
      'utf8',
    );
    expect(content).not.toContain('beforeLoad');
    expect(content).not.toContain('useAuthStore');
    expect(content).not.toContain('redirect');
    expect(content).toContain('MainLayout');
    expect(content).toContain('Outlet');
  });

  it('strips auth tsconfig aliases, keeps unrelated aliases', async () => {
    await removeAuthStack(authDir);
    const ts = JSON.parse(await readFile(join(authDir, 'tsconfig.base.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, unknown> };
    };
    expect(ts.compilerOptions.paths['@icore/auth-client']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/auth-supabase']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/auth-firebase']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/auth-mongodb']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/upload-client']).toBeDefined();
  });

  it('strips @icore/auth-client from api package.json, keeps other deps', async () => {
    await removeAuthStack(authDir);
    const pkg = JSON.parse(await readFile(join(authDir, 'apps/api/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@icore/auth-client']).toBeUndefined();
    expect(pkg.dependencies['@icore/upload-client']).toBeDefined();
  });

  it('strips AUTH_* lines from gateway .env, keeps other env vars', async () => {
    await removeAuthStack(authDir);
    const env = await readFile(join(authDir, 'apps/api/.env'), 'utf8');
    expect(env).not.toContain('AUTH_TRANSPORT');
    expect(env).not.toContain('AUTH_HOST');
    expect(env).toContain('UPLOAD_TRANSPORT');
  });

  it('strips auth service from docker-compose.yml and gateway depends_on', async () => {
    await removeAuthStack(authDir);
    const compose = await readFile(join(authDir, 'docker-compose.yml'), 'utf8');
    expect(compose).not.toContain('Dockerfile.ms-auth');
    expect(compose).not.toContain('AUTH_TRANSPORT');
    expect(compose).not.toContain('AUTH_REDIS_URL');
    // auth block under services gone, but gateway block stays
    expect(compose).toContain('gateway:');
    // auth entry in gateway.depends_on gone
    const gatewaySection = compose.slice(compose.indexOf('  gateway:'));
    expect(gatewaySection).not.toContain('auth:');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
yarn nx test create-icore --testFile=src/lib/__tests__/scaffold.unit.test.ts
```

Expected: FAIL — `removeAuthStack` is not exported.

- [ ] **Step 3: Implement `removeAuthStack` in `scaffold-strip.ts`**

Add the following imports to the top of `tools/create-icore/src/lib/scaffold-strip.ts`:

```ts
import { stripTsconfigKeys, stripJsonKeys } from '../manifest/wire-provider.js';
import { stripGatewayTransport } from './scaffold-env.js';
```

Then add `removeAuthStack` at the end of the file:

```ts
export async function removeAuthStack(targetDir: string): Promise<void> {
  // Delete dirs and files
  const rmPaths = [
    'apps/microservices/auth',
    'libs/auth-strategies',
    'libs/auth-client',
    'Dockerfile.ms-auth',
    'apps/api/src/app/auth',
    'apps/api/src/app/profile',
    'apps/api/src/app/abilities',
    'apps/client/src/components/auth',
    'apps/client/src/routes/login.tsx',
    'apps/client/src/routes/auth.callback.tsx',
    'apps/client/src/routes/auth.oauth.callback.tsx',
    'apps/client/src/routes/_dashboard/profile.tsx',
  ];
  for (const p of rmPaths) {
    await rm(join(targetDir, p), { recursive: true, force: true });
  }

  // Strip AuthModule, ProfileModule, AbilitiesModule from gateway app.module.ts
  const appModulePath = join(targetDir, 'apps/api/src/app/app.module.ts');
  try {
    const src = await readFile(appModulePath, 'utf8');
    const next = src
      .replace(/^import \{ AuthModule \} from '\.\/auth\/auth\.module';\n/m, '')
      .replace(/^import \{ ProfileModule \} from '\.\/profile\/profile\.module';\n/m, '')
      .replace(/^import \{ AbilitiesModule \} from '\.\/abilities\/abilities\.module';\n/m, '')
      .replace(/,\s*AuthModule/g, '')
      .replace(/,\s*ProfileModule/g, '')
      .replace(/,\s*AbilitiesModule/g, '');
    await writeFile(appModulePath, next);
  } catch {
    // ignore — may be absent in test scaffolds
  }

  // Strip beforeLoad auth guard from client _dashboard.tsx
  const dashboardPath = join(targetDir, 'apps/client/src/routes/_dashboard.tsx');
  try {
    const src = await readFile(dashboardPath, 'utf8');
    const next = src
      .replace(/^import \{ useAuthStore \} from '@icore\/template-shared';\n/m, '')
      .replace(/, redirect/g, '')
      .replace(/\n  beforeLoad: \(\) => \{[\s\S]*?\n  \},/, '');
    await writeFile(dashboardPath, next);
  } catch {
    // ignore — may be absent in test scaffolds
  }

  // Strip auth tsconfig aliases
  await stripTsconfigKeys(targetDir, [
    '@icore/auth-client',
    '@icore/auth-supabase',
    '@icore/auth-firebase',
    '@icore/auth-mongodb',
  ]);

  // Strip @icore/auth-client from gateway package.json
  await stripJsonKeys(join(targetDir, 'apps/api/package.json'), (k) => k === '@icore/auth-client');

  // Strip AUTH_* transport vars from gateway .env
  await stripGatewayTransport(targetDir, 'AUTH');

  // Strip auth service from docker-compose.yml
  const composePath = join(targetDir, 'docker-compose.yml');
  try {
    const compose = await readFile(composePath, 'utf8');
    const next = compose
      .replace(/\n {2}auth:[\s\S]+?(?=\n {2}\w+:|\nnetworks:)/m, '\n')
      .replace(/\n {6}auth:\n {8}condition: service_started/g, '')
      .replace(/\n {6}AUTH_TRANSPORT:[^\n]*/g, '')
      .replace(/\n {6}AUTH_REDIS_URL:[^\n]*/g, '');
    await writeFile(composePath, next);
  } catch {
    // ignore — may be absent in test scaffolds
  }
}
```

Also add `removeAuthStack` to the re-export list in `scaffold.ts`:

```ts
export {
  ...,
  removeAuthStack,
} from './scaffold-strip.js';
```

- [ ] **Step 4: Run tests — expect pass**

```bash
yarn nx test create-icore --testFile=src/lib/__tests__/scaffold.unit.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
yarn nx test create-icore
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/src/lib/scaffold-strip.ts \
        tools/create-icore/src/lib/scaffold.ts \
        tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts
git commit -m "feat(create-icore): implement removeAuthStack() for no-auth scaffold mode"
```

---

## Task 5: Wire `scaffold()` + Integration Test

**Files:**
- Modify: `tools/create-icore/src/lib/scaffold.ts`
- Test: `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts`

- [ ] **Step 1: Write failing integration test**

Extend `makeFakeTemplates` in `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts` to include auth-related dirs (add after the existing `apps/api/src/app/app.module.ts` write):

```ts
// Auth MS stub
await mkdir(join(tplDir, 'apps/microservices/auth/src'), { recursive: true });
await writeFile(join(tplDir, 'apps/microservices/auth/src/main.ts'), '');
await writeFile(
  join(tplDir, 'apps/microservices/auth/.env.example'),
  'AUTH_TRANSPORT=tcp\nAUTH_PROVIDER=supabase\n',
);
// Auth strategy libs stubs
await mkdir(join(tplDir, 'libs/auth-strategies/supabase'), { recursive: true });
await writeFile(join(tplDir, 'libs/auth-strategies/supabase/index.ts'), '');
await mkdir(join(tplDir, 'libs/auth-client/src'), { recursive: true });
await writeFile(join(tplDir, 'libs/auth-client/src/index.ts'), '');
// Gateway auth/profile/abilities dirs
await mkdir(join(tplDir, 'apps/api/src/app/auth'), { recursive: true });
await writeFile(join(tplDir, 'apps/api/src/app/auth/auth.module.ts'), '');
await mkdir(join(tplDir, 'apps/api/src/app/profile'), { recursive: true });
await writeFile(join(tplDir, 'apps/api/src/app/profile/profile.controller.ts'), '');
await mkdir(join(tplDir, 'apps/api/src/app/abilities'), { recursive: true });
await writeFile(join(tplDir, 'apps/api/src/app/abilities/ability.guard.ts'), '');
// Client auth routes and components (for the chosen shadcn template)
await mkdir(join(tplDir, 'apps/templates/client-shadcn/src/components/auth'), { recursive: true });
await writeFile(join(tplDir, 'apps/templates/client-shadcn/src/components/auth/LoginForm.tsx'), '');
await mkdir(join(tplDir, 'apps/templates/client-shadcn/src/routes/_dashboard'), { recursive: true });
await writeFile(join(tplDir, 'apps/templates/client-shadcn/src/routes/login.tsx'), '');
await writeFile(join(tplDir, 'apps/templates/client-shadcn/src/routes/auth.callback.tsx'), '');
await writeFile(join(tplDir, 'apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx'), '');
await writeFile(join(tplDir, 'apps/templates/client-shadcn/src/routes/_dashboard/profile.tsx'), '');
await writeFile(
  join(tplDir, 'apps/templates/client-shadcn/src/routes/_dashboard.tsx'),
  [
    "import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';",
    "import { useAuthStore } from '@icore/template-shared';",
    "import { MainLayout } from '../layouts/MainLayout';",
    "",
    "export const Route = createFileRoute('/_dashboard')({",
    "  beforeLoad: () => {",
    "    if (!useAuthStore.getState().accessToken) {",
    "      throw redirect({ to: '/login' });",
    "    }",
    "  },",
    "  component: () => (<MainLayout><Outlet /></MainLayout>),",
    "});",
  ].join('\n'),
);
// docker-compose.yml stub
await writeFile(
  join(tplDir, 'docker-compose.yml'),
  [
    'services:',
    '  auth:',
    '    build:',
    '      context: .',
    '      dockerfile: Dockerfile.ms-auth',
    '    restart: unless-stopped',
    '  gateway:',
    '    environment:',
    '      AUTH_TRANSPORT: redis',
    '    depends_on:',
    '      auth:',
    '        condition: service_started',
    'networks:',
    '  icore:',
    '    driver: bridge',
  ].join('\n'),
);
await writeFile(join(tplDir, 'Dockerfile.ms-auth'), '');
// tsconfig.base.json with auth aliases
await writeFile(
  join(tplDir, 'tsconfig.base.json'),
  JSON.stringify({
    compilerOptions: {
      paths: {
        '@icore/auth-client': ['libs/auth-client/src/index.ts'],
        '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'],
      },
    },
  }),
);
```

Then add the test (after existing `describe` blocks):

```ts
describe('scaffold with authProvider=none', () => {
  let outDir: string;
  let tplDir: string;

  beforeAll(async () => {
    tplDir = await makeFakeTemplates();
    outDir = await mkdtemp(join(tmpdir(), 'icore-out-no-auth-'));
    await scaffold(
      {
        projectName: 'no-auth-app',
        targetDir: outDir,
        authProvider: 'none',
        dbProvider: 'none',
        upload: 'none',
        payment: 'none',
        jobs: 'none',
        example: 'none',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'yarn',
        initGit: false,
        install: false,
      },
      tplDir,
    );
  });

  it('removes auth MS directory', async () => {
    await expect(access(join(outDir, 'apps/microservices/auth'))).rejects.toThrow();
  });

  it('removes auth strategy libs', async () => {
    await expect(access(join(outDir, 'libs/auth-strategies'))).rejects.toThrow();
  });

  it('removes auth-client lib', async () => {
    await expect(access(join(outDir, 'libs/auth-client'))).rejects.toThrow();
  });

  it('removes gateway auth/, profile/, abilities/ dirs', async () => {
    await expect(access(join(outDir, 'apps/api/src/app/auth'))).rejects.toThrow();
    await expect(access(join(outDir, 'apps/api/src/app/profile'))).rejects.toThrow();
    await expect(access(join(outDir, 'apps/api/src/app/abilities'))).rejects.toThrow();
  });

  it('client _dashboard.tsx has no beforeLoad', async () => {
    const content = await readFile(
      join(outDir, 'apps/client/src/routes/_dashboard.tsx'),
      'utf8',
    );
    expect(content).not.toContain('beforeLoad');
    expect(content).not.toContain('useAuthStore');
  });

  it('gateway-services.ts has no auth entry', async () => {
    const gs = await readFile(
      join(outDir, 'apps/api/src/app/gateway-services.ts'),
      'utf8',
    );
    expect(gs).not.toContain("name: 'auth'");
  });
});
```

Also add `access` to the existing node:fs/promises import at the top if not present.

- [ ] **Step 2: Run integration test to confirm it fails**

```bash
yarn nx test create-icore --testFile=src/lib/__tests__/scaffold.integration.unit.test.ts
```

Expected: FAIL — `scaffold()` doesn't branch on auth=none yet.

- [ ] **Step 3: Update `scaffold.ts`**

In `tools/create-icore/src/lib/scaffold.ts`:

**a) Add `AuthBackend` to the options import:**

```ts
import type { CreateIcoreOptions } from './options.js';
import type { AuthBackend } from './options.js';
```

Or combine:
```ts
import type { CreateIcoreOptions, AuthBackend } from './options.js';
```

**b) Guard `writeAuthEnv`** — find the current call and wrap it:

```ts
if (opts.authProvider !== 'none') await writeAuthEnv(opts.targetDir, opts);
```

**c) Replace the auth cleanup block** — find the lines:

```ts
await cleanupUnusedAuth(opts.targetDir, opts.authProvider);
await writeAuthProvider(opts.targetDir, opts.authProvider);
```

And replace with:

```ts
if (opts.authProvider !== 'none') {
  await cleanupUnusedAuth(opts.targetDir, opts.authProvider as AuthBackend);
  await writeAuthProvider(opts.targetDir, opts.authProvider as AuthBackend);
} else {
  await removeAuthStack(opts.targetDir);
}
```

`removeAuthStack` is already re-exported from `scaffold.ts` after Task 4.

- [ ] **Step 4: Run integration test — expect pass**

```bash
yarn nx test create-icore --testFile=src/lib/__tests__/scaffold.integration.unit.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
yarn nx test create-icore
```

Expected: all tests PASS (95+ tests).

- [ ] **Step 6: Build**

```bash
yarn nx build create-icore
```

Expected: green.

- [ ] **Step 7: Run prettier + lint**

```bash
npx prettier --write tools/create-icore/src/lib/scaffold.ts \
  tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts
yarn nx lint create-icore
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add tools/create-icore/src/lib/scaffold.ts \
        tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts
git commit -m "feat(create-icore): branch scaffold() on authProvider=none to call removeAuthStack"
```

---

## Task 6: Changeset + Docs

**Files:**
- Create: `.changeset/no-auth-mode.md`
- Modify: `docs/create-icore/README.md` or equivalent (check `docs/` for the CLI docs file)

- [ ] **Step 1: Create changeset**

Create `.changeset/no-auth-mode.md`:

```md
---
"@idevconn/create-icore": minor
---

Add `authProvider: 'none'` option — scaffolds a minimal Nx monorepo (gateway + React client) with no auth microservice, no AuthGuard, and no login routes.
```

- [ ] **Step 2: Update CLI docs**

Find the create-icore docs file (check `docs/create-icore/` or `tools/create-icore/README.md`) and add the `--auth none` flag documentation. If the docs list auth providers:

```
--auth <provider>    Auth provider: supabase | firebase | mongodb | none
                     Use 'none' for a simple SPA with no login system.
                     When 'none': db, example, and transport questions are skipped.
```

- [ ] **Step 3: Run full test suite + build one final time**

```bash
yarn nx test create-icore && yarn nx build create-icore
```

Expected: green.

- [ ] **Step 4: Run prettier on all touched files**

```bash
npx prettier --write \
  tools/create-icore/src/lib/options.ts \
  tools/create-icore/src/lib/config.ts \
  tools/create-icore/src/lib/prompts.ts \
  tools/create-icore/src/lib/scaffold.ts \
  tools/create-icore/src/lib/scaffold-strip.ts \
  tools/create-icore/src/manifest/wire-auth.ts \
  tools/create-icore/src/manifest/wire-features.ts \
  tools/create-icore/src/lib/__tests__/config.unit.test.ts \
  tools/create-icore/src/lib/__tests__/prompts.unit.test.ts \
  tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts \
  tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts \
  tools/create-icore/src/manifest/__tests__/wire-features.unit.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add .changeset/no-auth-mode.md
git commit -m "chore: changeset + docs for authProvider=none feature"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| `AuthBackend` + `AuthProvider\|='none'` + `DbProvider\|='none'` | Task 1 |
| `validateConfig` accepts `'none'` | Task 1 |
| `--auth none` CLI flag | Task 2 (parseFlags already works; test added) |
| `collectOptions` cascade: db='none', example='none' | Task 2 |
| `collectOptions` cascade: skip transport when no MS | Task 2 |
| `writeFeaturesWiring` omits auth from `gateway-services.ts` | Task 3 |
| `removeAuthStack` deletes dirs | Task 4 |
| `removeAuthStack` strips `app.module.ts` | Task 4 |
| `removeAuthStack` strips `_dashboard.tsx` | Task 4 |
| `removeAuthStack` strips tsconfig aliases | Task 4 |
| `removeAuthStack` strips api `package.json` | Task 4 |
| `removeAuthStack` strips gateway `.env` AUTH vars | Task 4 |
| `removeAuthStack` strips `docker-compose.yml` | Task 4 |
| `scaffold()` guards `writeAuthEnv` | Task 5 |
| `scaffold()` branches to `removeAuthStack` | Task 5 |
| Integration test: full scaffold with auth=none | Task 5 |
| Changeset (minor) | Task 6 |
| `wire-auth.ts` uses `AuthBackend` type | Task 1 |

All spec requirements covered. ✓
