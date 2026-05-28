# Plan 7: `@idevconn/create-icore` CLI + Publish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the bootstrap CLI. Consumer runs `npm init @idevconn/icore my-app` → CLI prompts auth provider / storage provider / UI library / MS transport / git → copies the icore template tree to `my-app/`, writes a provider-specific `.env`, installs deps, init's git, leaves a runnable monorepo. After this plan: the npm package is published; the bragging command works on a fresh machine.

**Architecture:** The CLI lives in `tools/create-icore/` as an Nx-generated lib (`@nx/js:lib`, bundler `tsup`). Templates are baked INTO the npm tarball — `tools/create-icore/templates/` is populated by a `prebuild` script that copies/sanitises the current monorepo source (apps + libs + root configs) at build time. At runtime the CLI:

1. Parses flags + interactive prompts via `@clack/prompts`
2. Resolves the chosen `--ui` (shadcn / antd / mui) — only shadcn ships in v0.1.0; antd + mui are wired to print "coming soon" and fall back to shadcn.
3. Copies `templates/` to the target dir
4. Renames placeholders (`@icore/*` → `@<projectName>/*` optional later; keep `@icore/*` for v0.1.0 since libs aren't published)
5. Rewrites `.env.example` → `.env` per provider selection
6. Removes templates the user didn't pick (`apps/templates/client-{antd,mui}` once those exist)
7. `git init` + initial commit
8. `yarn install`
9. Prints next-steps

**Tech Stack:** `@clack/prompts` (modern terminal UI), `kleur` (colours), `tsup` (build), `commander` or plain `process.argv` parsing (probably plain — single command), Vitest 4 for unit tests, `tempy` or `node:fs.mkdtempSync` for integration test sandboxes.

**Source spec:** `docs/superpowers/specs/2026-05-28-icore-design.md`

**Branch:** `dev`. Plan 6 HEAD: `1e307b2`.

**Generators only** — `nx g @nx/js:lib` for the CLI.

---

## Task 1: Scaffold `tools/create-icore`

- [ ] **Step 1: Generate**

```bash
cd /home/vladimir-tkach/Projects/icore
yarn nx g @nx/js:lib --name=create-icore --directory=tools/create-icore --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@idevconn/create-icore --no-interactive
```

(We use `--bundler=tsc` so the Nx project graph is happy; the actual publish build uses tsup — see Task 4.)

- [ ] **Step 2: Cleanup placeholders + tsconfig**

Same pattern as `libs/template-shared`. Set `tsconfig.json` to `module: node16, moduleResolution: node16` for compat with the CLI's runtime (Node 22). Set `vitest.config.mts` `passWithNoTests: true`.

- [ ] **Step 3: package.json shape**

The Nx project lib needs a publish-ready `package.json`. After the generator:

```json
{
  "name": "@idevconn/create-icore",
  "version": "0.1.0",
  "description": "Bootstrap a new project from the icore scaffold (Nx + NestJS + React + Vite + shadcn/Tailwind, swappable auth + storage providers).",
  "license": "Apache-2.0",
  "author": "iDEVconn",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/iDEVconn/create-icore.git",
    "directory": "tools/create-icore"
  },
  "type": "module",
  "bin": {
    "create-icore": "./dist/cli.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "templates", "README.md", "LICENSE"],
  "engines": { "node": ">=20" },
  "dependencies": {
    "@clack/prompts": "^0.7.0",
    "kleur": "^4.1.5"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "vitest": "^4.0.0"
  },
  "publishConfig": { "access": "public" }
}
```

- [ ] **Step 4: Commit**

```bash
git add tools/create-icore package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(create-icore): scaffold tools/create-icore lib + publish-ready package.json"
```

---

## Task 2: Prompts + CLI entry

- [ ] **Step 1: Install deps**

```bash
yarn add @clack/prompts kleur
yarn add -D tsup
```

- [ ] **Step 2: Define types**

Create `tools/create-icore/src/lib/options.ts`:

```ts
export type AuthProvider = 'supabase' | 'firebase';
export type StorageProvider = 'supabase' | 'firebase' | 'cloudinary';
export type UiLibrary = 'shadcn' | 'antd' | 'mui';
export type MsTransport = 'tcp' | 'redis' | 'nats';

export interface CreateIcoreOptions {
  projectName: string;
  targetDir: string;
  authProvider: AuthProvider;
  storageProvider: StorageProvider;
  ui: UiLibrary;
  transport: MsTransport;
  initGit: boolean;
  install: boolean;
}
```

- [ ] **Step 3: Prompts**

Create `tools/create-icore/src/lib/prompts.ts`:

```ts
import * as p from '@clack/prompts';
import { resolve } from 'node:path';
import type { CreateIcoreOptions } from './options';

export interface PromptInput {
  argv: string[];
  cwd: string;
}

function parseFlags(argv: string[]): Partial<CreateIcoreOptions> & { projectName?: string } {
  const out: Partial<CreateIcoreOptions> & { projectName?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      if (!out.projectName) out.projectName = a;
      continue;
    }
    const [k, vIn] = a.includes('=') ? a.split('=', 2) : [a, argv[++i]];
    const key = k.slice(2);
    const v = vIn as string;
    switch (key) {
      case 'auth':
        out.authProvider = v as 'supabase' | 'firebase';
        break;
      case 'storage':
        out.storageProvider = v as 'supabase' | 'firebase' | 'cloudinary';
        break;
      case 'ui':
        out.ui = v as 'shadcn' | 'antd' | 'mui';
        break;
      case 'transport':
        out.transport = v as 'tcp' | 'redis' | 'nats';
        break;
      case 'no-git':
        out.initGit = false;
        break;
      case 'no-install':
        out.install = false;
        break;
    }
  }
  return out;
}

export async function collectOptions({ argv, cwd }: PromptInput): Promise<CreateIcoreOptions> {
  const flags = parseFlags(argv);

  p.intro('icore — bootstrap a new project');

  const projectName =
    flags.projectName ??
    ((await p.text({
      message: 'Project name',
      placeholder: 'my-app',
      validate: (v) => (v && /^[a-z0-9-]+$/i.test(v) ? undefined : 'Use letters, digits, hyphens'),
    })) as string);
  if (p.isCancel(projectName)) throw new Error('cancelled');

  const authProvider =
    flags.authProvider ??
    ((await p.select({
      message: 'Auth provider',
      options: [
        { value: 'supabase', label: 'Supabase' },
        { value: 'firebase', label: 'Firebase' },
      ],
    })) as 'supabase' | 'firebase');
  if (p.isCancel(authProvider)) throw new Error('cancelled');

  const storageProvider =
    flags.storageProvider ??
    ((await p.select({
      message: 'Storage provider',
      options: [
        { value: 'supabase', label: 'Supabase Storage' },
        { value: 'firebase', label: 'Firebase Cloud Storage' },
        { value: 'cloudinary', label: 'Cloudinary' },
      ],
    })) as 'supabase' | 'firebase' | 'cloudinary');
  if (p.isCancel(storageProvider)) throw new Error('cancelled');

  const ui =
    flags.ui ??
    ((await p.select({
      message: 'UI library',
      options: [
        { value: 'shadcn', label: 'shadcn/ui + Tailwind' },
        { value: 'antd', label: 'Ant Design (coming soon — falls back to shadcn)' },
        { value: 'mui', label: 'MUI (coming soon — falls back to shadcn)' },
      ],
      initialValue: 'shadcn',
    })) as 'shadcn' | 'antd' | 'mui');
  if (p.isCancel(ui)) throw new Error('cancelled');

  const transport =
    flags.transport ??
    ((await p.select({
      message: 'Microservice transport',
      options: [
        { value: 'tcp', label: 'TCP (default, no broker required)' },
        { value: 'redis', label: 'Redis' },
        { value: 'nats', label: 'NATS' },
      ],
      initialValue: 'tcp',
    })) as 'tcp' | 'redis' | 'nats');
  if (p.isCancel(transport)) throw new Error('cancelled');

  const initGit =
    flags.initGit ??
    !(await p.confirm({ message: 'Initialise git repo?', initialValue: true })) === false;
  const install =
    flags.install ??
    !(await p.confirm({ message: 'Run yarn install?', initialValue: true })) === false;

  return {
    projectName,
    targetDir: resolve(cwd, projectName),
    authProvider,
    storageProvider,
    ui: ui === 'shadcn' ? 'shadcn' : 'shadcn', // antd/mui fall back to shadcn for v0.1.0
    transport,
    initGit,
    install,
  };
}
```

- [ ] **Step 4: CLI entrypoint**

Create `tools/create-icore/src/cli.ts`:

```ts
#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { collectOptions } from './lib/prompts';
import { scaffold } from './lib/scaffold';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '..', 'templates');

async function main() {
  if (!existsSync(templatesDir)) {
    p.log.error(`Templates directory missing: ${templatesDir}`);
    process.exit(1);
  }

  const opts = await collectOptions({ argv: process.argv.slice(2), cwd: process.cwd() });

  if (existsSync(opts.targetDir)) {
    p.log.error(`Target directory already exists: ${opts.targetDir}`);
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Scaffolding project');
  await scaffold(opts, templatesDir);
  spinner.stop('Project scaffolded');

  p.outro(kleur.green('Done.'));
  p.log.info(`Next:`);
  p.log.info(`  cd ${opts.projectName}`);
  if (!opts.install) p.log.info(`  yarn install`);
  p.log.info(`  yarn dev      # gateway + auth MS + upload MS + client`);
  p.log.info(`  open http://localhost:4200`);
  p.log.info(`  edit apps/microservices/auth/.env to plug in real ${opts.authProvider} creds`);
}

main().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore package.json yarn.lock
git commit -m "feat(create-icore): @clack/prompts-based CLI entrypoint + flag parsing"
```

---

## Task 3: Scaffolding (template copy + env writer + git init + yarn install)

- [ ] **Step 1: Copy logic**

Create `tools/create-icore/src/lib/scaffold.ts`:

```ts
import { copyFile, mkdir, readdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CreateIcoreOptions } from './options';

const IGNORE_TOP = new Set([
  '.git',
  'node_modules',
  '.yarn/cache',
  '.yarn/unplugged',
  '.yarn/install-state.gz',
  '.nx',
  'dist',
  'tmp',
  'coverage',
  '.idea',
  '.vscode',
]);

async function copyTree(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_TOP.has(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) await copyTree(s, d);
    else if (entry.isFile()) await copyFile(s, d);
    // symlinks skipped intentionally
  }
}

async function rewriteRootPackageJson(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const pkgPath = join(targetDir, 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  pkg.name = opts.projectName;
  pkg.version = '0.0.1';
  pkg.private = true;
  delete (pkg as { description?: string }).description;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

async function writeAuthEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/microservices/auth/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^AUTH_PROVIDER=.*$/m, `AUTH_PROVIDER=${opts.authProvider}`)
    .replace(/^AUTH_TRANSPORT=.*$/m, `AUTH_TRANSPORT=${opts.transport}`);
  if (opts.transport !== 'tcp') {
    // Uncomment the matching transport URL line
    next = next.replace(/^# (AUTH_(?:REDIS|NATS)_URL=)/m, '$1');
  }
  await writeFile(join(targetDir, 'apps/microservices/auth/.env'), next);
}

async function writeUploadEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/microservices/upload/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^STORAGE_PROVIDER=.*$/m, `STORAGE_PROVIDER=${opts.storageProvider}`)
    .replace(/^UPLOAD_TRANSPORT=.*$/m, `UPLOAD_TRANSPORT=${opts.transport}`);
  if (opts.transport !== 'tcp') {
    next = next.replace(/^# (UPLOAD_(?:REDIS|NATS)_URL=)/m, '$1');
  }
  await writeFile(join(targetDir, 'apps/microservices/upload/.env'), next);
}

async function writeGatewayEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/api/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^AUTH_TRANSPORT=.*$/m, `AUTH_TRANSPORT=${opts.transport}`)
    .replace(/^UPLOAD_TRANSPORT=.*$/m, `UPLOAD_TRANSPORT=${opts.transport}`);
  if (opts.transport !== 'tcp') {
    next = next
      .replace(/^# (AUTH_(?:REDIS|NATS)_URL=)/m, '$1')
      .replace(/^# (UPLOAD_(?:REDIS|NATS)_URL=)/m, '$1');
  }
  await writeFile(join(targetDir, 'apps/api/.env'), next);
}

async function selectClientTemplate(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  // v0.1.0 ships only shadcn. Drop the templates dir altogether and move the
  // chosen template into apps/client.
  const templatesRoot = join(targetDir, 'apps/templates');
  const chosen = join(templatesRoot, `client-${opts.ui}`);
  const destClient = join(targetDir, 'apps/client');
  try {
    const s = await stat(chosen);
    if (!s.isDirectory()) throw new Error('not a dir');
  } catch {
    // antd / mui not yet implemented — fall back to shadcn
    await copyTree(join(templatesRoot, 'client-shadcn'), destClient);
    await rm(templatesRoot, { recursive: true, force: true });
    return;
  }
  await copyTree(chosen, destClient);
  await rm(templatesRoot, { recursive: true, force: true });
}

function gitInit(cwd: string, projectName: string): void {
  spawnSync('git', ['init'], { cwd, stdio: 'inherit' });
  spawnSync('git', ['add', '.'], { cwd, stdio: 'inherit' });
  spawnSync(
    'git',
    ['commit', '-m', `chore: bootstrap ${projectName} from @idevconn/create-icore`],
    { cwd, stdio: 'inherit' },
  );
}

function yarnInstall(cwd: string): void {
  spawnSync('yarn', ['install'], { cwd, stdio: 'inherit' });
}

export async function scaffold(opts: CreateIcoreOptions, templatesDir: string): Promise<void> {
  await copyTree(templatesDir, opts.targetDir);
  await rewriteRootPackageJson(opts.targetDir, opts);
  await writeAuthEnv(opts.targetDir, opts);
  await writeUploadEnv(opts.targetDir, opts);
  await writeGatewayEnv(opts.targetDir, opts);
  await selectClientTemplate(opts.targetDir, opts);
  if (opts.install) yarnInstall(opts.targetDir);
  if (opts.initGit) gitInit(opts.targetDir, opts.projectName);
}

// Re-export for tests
export {
  copyTree,
  rewriteRootPackageJson,
  writeAuthEnv,
  writeUploadEnv,
  writeGatewayEnv,
  selectClientTemplate,
};
```

- [ ] **Step 2: Commit**

```bash
git add tools/create-icore
git commit -m "feat(create-icore): scaffold copies templates, rewrites env, init's git, runs install"
```

---

## Task 4: Template snapshot at build time + tsup

The published npm tarball needs `templates/` baked in. That dir doesn't live in source — it's populated at build time from the current monorepo.

- [ ] **Step 1: Build script**

Create `tools/create-icore/scripts/snapshot-templates.ts`:

```ts
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(here, '..', 'templates');

const PATHS_TO_COPY = [
  'apps/api',
  'apps/microservices/auth',
  'apps/microservices/upload',
  'apps/templates',
  'libs',
  'tools/create-icore/_template-shell',
  'tsconfig.base.json',
  'nx.json',
  '.gitignore',
  '.nvmrc',
  '.prettierrc',
  '.prettierignore',
  '.yarnrc.yml',
  'eslint.config.mjs',
  '.husky/pre-commit',
];

const SHELL_OVERRIDES = ['package.json'];

const IGNORE_REL = new Set([
  'node_modules',
  '.nx',
  'dist',
  '.yarn/cache',
  '.yarn/unplugged',
  '.yarn/install-state.gz',
  'coverage',
  'tmp',
]);

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  for (const rel of PATHS_TO_COPY) {
    const src = resolve(root, rel);
    const dest = resolve(out, rel);
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest, {
      recursive: true,
      filter: (entry) => {
        const r = entry.replace(root + '/', '');
        for (const ig of IGNORE_REL) if (r.includes(`/${ig}`) || r === ig) return false;
        return true;
      },
    });
  }

  // shell-level overrides — a curated package.json that strips devDeps and
  // tools-specific scripts; copied LAST so it wins.
  for (const f of SHELL_OVERRIDES) {
    const shell = resolve(here, '..', '_template-shell', f);
    const dest = resolve(out, f);
    await cp(shell, dest);
  }

  console.log(`Templates written to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Shell package.json**

Create `tools/create-icore/_template-shell/package.json` — a stripped-down version of the workspace root suitable for consumers:

```json
{
  "name": "icore-app",
  "version": "0.0.1",
  "private": true,
  "packageManager": "yarn@4.5.0",
  "workspaces": [
    "apps/*",
    "apps/microservices/*",
    "libs/*",
    "libs/auth-strategies/*",
    "libs/storage-strategies/*"
  ],
  "scripts": {
    "dev": "nx run-many -t serve",
    "build": "nx run-many -t build",
    "lint": "nx run-many -t lint",
    "test": "nx run-many -t test",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,md,json}\"",
    "prepare": "husky"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

`prebuild` populates the dependency lists during template snapshot via a separate post-process step that reads the real root `package.json` — for now ship empty; future revision can hoist common deps.

- [ ] **Step 3: tsup config**

Create `tools/create-icore/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: true,
  shims: true,
  splitting: false,
});
```

Create `tools/create-icore/src/index.ts`:

```ts
export * from './lib/options';
export { scaffold } from './lib/scaffold';
export { collectOptions } from './lib/prompts';
```

- [ ] **Step 4: Update project.json**

Add `prebuild` + `build` targets that snapshot templates then bundle via tsup. Edit `tools/create-icore/project.json` to include:

```json
"snapshot-templates": {
  "executor": "nx:run-commands",
  "options": {
    "command": "tsx tools/create-icore/scripts/snapshot-templates.ts"
  }
},
"build": {
  "dependsOn": ["snapshot-templates"],
  "executor": "nx:run-commands",
  "options": {
    "command": "tsup --config tools/create-icore/tsup.config.ts",
    "cwd": "tools/create-icore"
  },
  "outputs": ["{projectRoot}/dist", "{projectRoot}/templates"]
}
```

Install `tsx`:

```bash
yarn add -D tsx
```

- [ ] **Step 5: Verify**

```bash
yarn nx build create-icore
ls tools/create-icore/dist
ls tools/create-icore/templates
```

The dist should contain `cli.js`, `cli.d.ts`, `index.js`, `index.d.ts`. The templates dir should contain `apps/`, `libs/`, `tsconfig.base.json`, etc.

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore package.json yarn.lock
git commit -m "feat(create-icore): tsup build + template snapshot at build time"
```

---

## Task 5: Tests

- [ ] **Step 1: Unit tests for scaffold helpers**

Create `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthEnv, writeGatewayEnv, writeUploadEnv } from '../scaffold';
import type { CreateIcoreOptions } from '../options';

const baseOpts: CreateIcoreOptions = {
  projectName: 'my-app',
  targetDir: '',
  authProvider: 'supabase',
  storageProvider: 'cloudinary',
  ui: 'shadcn',
  transport: 'tcp',
  initGit: false,
  install: false,
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'icore-test-'));
  await mkdir(join(dir, 'apps/microservices/auth'), { recursive: true });
  await mkdir(join(dir, 'apps/microservices/upload'), { recursive: true });
  await mkdir(join(dir, 'apps/api'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/auth/.env.example'),
    [
      'AUTH_TRANSPORT=tcp',
      'AUTH_HOST=127.0.0.1',
      'AUTH_PORT=4001',
      '# AUTH_REDIS_URL=redis://localhost:6379',
      'AUTH_PROVIDER=supabase',
    ].join('\n'),
  );
  await writeFile(
    join(dir, 'apps/microservices/upload/.env.example'),
    [
      'UPLOAD_TRANSPORT=tcp',
      'UPLOAD_HOST=127.0.0.1',
      'UPLOAD_PORT=4002',
      '# UPLOAD_REDIS_URL=redis://localhost:6379',
      'STORAGE_PROVIDER=supabase',
    ].join('\n'),
  );
  await writeFile(
    join(dir, 'apps/api/.env.example'),
    ['AUTH_TRANSPORT=tcp', '# AUTH_REDIS_URL=redis://localhost:6379', 'UPLOAD_TRANSPORT=tcp'].join(
      '\n',
    ),
  );
});

describe('writeAuthEnv', () => {
  it('replaces AUTH_PROVIDER with the chosen value', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, authProvider: 'firebase' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_PROVIDER=firebase');
    expect(env).not.toContain('AUTH_PROVIDER=supabase');
  });

  it('keeps AUTH_TRANSPORT=tcp by default', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_TRANSPORT=tcp');
  });

  it('uncomments AUTH_REDIS_URL when transport=redis', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, transport: 'redis' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_REDIS_URL=redis://localhost:6379');
    expect(env).not.toContain('# AUTH_REDIS_URL=');
  });
});

describe('writeUploadEnv', () => {
  it('replaces STORAGE_PROVIDER', async () => {
    await writeUploadEnv(dir, { ...baseOpts, targetDir: dir, storageProvider: 'cloudinary' });
    const env = await readFile(join(dir, 'apps/microservices/upload/.env'), 'utf8');
    expect(env).toContain('STORAGE_PROVIDER=cloudinary');
  });
});

describe('writeGatewayEnv', () => {
  it('replaces both transports', async () => {
    await writeGatewayEnv(dir, { ...baseOpts, targetDir: dir, transport: 'nats' });
    const env = await readFile(join(dir, 'apps/api/.env'), 'utf8');
    expect(env).toContain('AUTH_TRANSPORT=nats');
    expect(env).toContain('UPLOAD_TRANSPORT=nats');
  });
});
```

- [ ] **Step 2: Flag parser test**

Create `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

// Re-import the parser via a back-door — tests should exercise the public
// surface where possible. For Plan 7 v0.1.0 we only need to confirm CLI
// flags map to options correctly.
// (If parseFlags is not exported, export it from prompts.ts for tests.)

import { parseFlags } from '../prompts';

describe('parseFlags', () => {
  it('reads project name from the first positional arg', () => {
    expect(parseFlags(['my-app']).projectName).toBe('my-app');
  });

  it('reads --auth=firebase', () => {
    expect(parseFlags(['my-app', '--auth=firebase']).authProvider).toBe('firebase');
  });

  it('reads space-separated flag value', () => {
    expect(parseFlags(['my-app', '--storage', 'cloudinary']).storageProvider).toBe('cloudinary');
  });

  it('honours --no-git', () => {
    expect(parseFlags(['my-app', '--no-git']).initGit).toBe(false);
  });

  it('honours --no-install', () => {
    expect(parseFlags(['my-app', '--no-install']).install).toBe(false);
  });
});
```

You'll need to `export` `parseFlags` from `prompts.ts` for this test.

- [ ] **Step 3: Verify**

```bash
yarn nx test create-icore
yarn nx lint create-icore
```

8+ tests pass. Lint silent.

- [ ] **Step 4: Commit**

```bash
git add tools/create-icore
git commit -m "test(create-icore): unit tests for env-rewrite helpers + flag parser"
```

---

## Task 6: Dry-run smoke test (no install / no git)

- [ ] **Step 1: Integration test**

Create `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts`:

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtemp, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold } from '../scaffold';

async function makeFakeTemplates(): Promise<string> {
  const tplDir = await mkdtemp(join(tmpdir(), 'icore-tpl-'));
  // minimal subset — root + the three apps + a stub libs dir + a stub client-shadcn
  await writeFile(
    join(tplDir, 'package.json'),
    JSON.stringify({ name: 'icore', version: '0.1.0' }, null, 2),
  );
  await mkdir(join(tplDir, 'apps/api'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/api/.env.example'),
    'AUTH_TRANSPORT=tcp\nUPLOAD_TRANSPORT=tcp\n',
  );
  await mkdir(join(tplDir, 'apps/microservices/auth'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/auth/.env.example'),
    'AUTH_TRANSPORT=tcp\nAUTH_PROVIDER=supabase\n',
  );
  await mkdir(join(tplDir, 'apps/microservices/upload'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/upload/.env.example'),
    'UPLOAD_TRANSPORT=tcp\nSTORAGE_PROVIDER=supabase\n',
  );
  await mkdir(join(tplDir, 'apps/templates/client-shadcn/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-shadcn/package.json'), '{}');
  return tplDir;
}

describe('scaffold (integration, dry-run)', () => {
  let templatesDir: string;
  let outputDir: string;

  beforeAll(async () => {
    templatesDir = await makeFakeTemplates();
    outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'my-app');
  });

  it('copies the tree, rewrites env, picks the shadcn template', async () => {
    await scaffold(
      {
        projectName: 'my-app',
        targetDir: outputDir,
        authProvider: 'firebase',
        storageProvider: 'cloudinary',
        ui: 'shadcn',
        transport: 'redis',
        initGit: false,
        install: false,
      },
      templatesDir,
    );

    const pkg = JSON.parse(await readFile(join(outputDir, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('my-app');

    const authEnv = await readFile(join(outputDir, 'apps/microservices/auth/.env'), 'utf8');
    expect(authEnv).toContain('AUTH_PROVIDER=firebase');
    expect(authEnv).toContain('AUTH_TRANSPORT=redis');

    const uploadEnv = await readFile(join(outputDir, 'apps/microservices/upload/.env'), 'utf8');
    expect(uploadEnv).toContain('STORAGE_PROVIDER=cloudinary');

    // apps/templates should be gone, apps/client should exist
    const apps = await readdir(join(outputDir, 'apps'));
    expect(apps).toContain('client');
    expect(apps).not.toContain('templates');
  });
});
```

- [ ] **Step 2: Verify**

```bash
yarn nx test create-icore
```

All tests pass (unit + integration).

- [ ] **Step 3: Commit**

```bash
git add tools/create-icore
git commit -m "test(create-icore): integration smoke — full scaffold with mocked templates dir"
```

---

## Task 7: README + LICENSE + publish prep

- [ ] **Step 1: README**

Create `tools/create-icore/README.md`:

````markdown
# `@idevconn/create-icore`

Bootstrap a new project from the [icore](https://github.com/iDEVconn/create-icore) scaffold — Nx + NestJS + React + Vite + shadcn/Tailwind, with swappable auth + storage providers.

## Usage

```bash
# Short form via npm init
npm init @idevconn/icore my-app

# Or interactive
npx @idevconn/create-icore my-app
```

The CLI prompts:

- **Auth provider** — Supabase / Firebase
- **Storage provider** — Supabase / Firebase / Cloudinary
- **UI library** — shadcn/Tailwind (default; antd + MUI coming in 6.1/6.2)
- **MS transport** — TCP / Redis / NATS
- **Init git** — yes/no
- **Run install** — yes/no

After scaffolding:

```bash
cd my-app
yarn dev      # gateway (:3001) + auth MS (:4001) + upload MS (:4002) + client (:4200)
open http://localhost:4200
```

## Flags (non-interactive)

```bash
npm init @idevconn/icore my-app -- \
  --auth=supabase \
  --storage=supabase \
  --ui=shadcn \
  --transport=tcp \
  --no-git \
  --no-install
```

## What ships

- `apps/api/` — NestJS gateway with Swagger UI at `/api/docs`, CASL `@CheckAbility` gating, Throttler rate limit
- `apps/microservices/auth/` — `AuthStrategy` consumer over `AUTH_PROVIDER` env
- `apps/microservices/upload/` — `StorageStrategy` consumer over `STORAGE_PROVIDER` env
- `apps/client/` — Vite + React 19 + Tailwind 4 + shadcn/ui + TanStack Router + Query
- `libs/shared/` — provider-agnostic contracts, CASL `defineAbilitiesFor`, transport helper, in-memory fakes
- `libs/auth-strategies/{supabase,firebase}/` — concrete `AuthStrategy` implementations
- `libs/storage-strategies/{supabase,firebase,cloudinary}/` — concrete `StorageStrategy` implementations
- `libs/auth-client` + `libs/upload-client` — gateway-side NestJS modules
- `libs/template-shared/` — Zustand stores, i18n bootstrap, ability provider, useNotify abstraction

Read more in `docs/architecture.md` of the generated project.

## License

Apache-2.0
````

- [ ] **Step 2: LICENSE**

Copy from the workspace root if it has one, otherwise drop in an Apache-2.0 stub.

- [ ] **Step 3: Commit**

```bash
git add tools/create-icore
git commit -m "docs(create-icore): README + LICENSE"
```

---

## Task 9: CI/CD pipelines

Add three GitHub Actions workflows, modelled on `warranty/.github/workflows/` (nx affected pipeline + sync-main-to-dev) and `use-draft/.github/workflows/release.yml` (changesets-driven npm publish).

### Files to create

- `.github/actions/setup/action.yml` — composite action: checkout already happened upstream, this sets up yarn 4 + caches node_modules
- `.github/workflows/pipeline.yml` — pushes/PRs against `main` + `dev`: detect affected → lint/test/format matrix → build matrix
- `.github/workflows/release.yml` — pushes to `main`: changesets-driven `@idevconn/create-icore` publish with OIDC trusted publishing + npm provenance
- `.github/workflows/sync-main-to-dev.yml` — pushes to `main`: open auto-PR back to `dev` so the next dev→main PR stays merge-clean
- `.changeset/config.json` — changesets config gated to `@idevconn/create-icore` only
- `.changeset/README.md` — pointer for contributors

### Steps

- [ ] **Step 1: Install changesets**

```bash
yarn add -D @changesets/cli
yarn changeset init
```

This creates `.changeset/config.json` + `.changeset/README.md`. Edit the config so only `@idevconn/create-icore` is in the public list and everything under `@icore/*` is `ignore`d (internal workspace libs, never published):

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@icore/shared",
    "@icore/auth-supabase",
    "@icore/auth-firebase",
    "@icore/storage-supabase",
    "@icore/storage-firebase",
    "@icore/storage-cloudinary",
    "@icore/auth-client",
    "@icore/upload-client",
    "@icore/template-shared"
  ]
}
```

- [ ] **Step 2: Composite setup action**

Create `.github/actions/setup/action.yml`:

```yaml
name: Setup
description: Set up Node + yarn 4 + cache
runs:
  using: composite
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: 22
    - name: Enable corepack
      shell: bash
      run: corepack enable
    - name: Cache yarn
      uses: actions/cache@v4
      with:
        path: |
          .yarn/cache
          .yarn/install-state.gz
          node_modules
        key: yarn-${{ runner.os }}-${{ hashFiles('yarn.lock') }}
        restore-keys: |
          yarn-${{ runner.os }}-
    - name: Install
      shell: bash
      run: yarn install --immutable
```

- [ ] **Step 3: Pipeline workflow**

Create `.github/workflows/pipeline.yml`:

```yaml
name: Pipeline

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]
  workflow_dispatch:

concurrency:
  group: pipeline-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  actions: read

jobs:
  detect-affected:
    name: Detect affected projects
    runs-on: ubuntu-latest
    outputs:
      has-affected: ${{ steps.affected.outputs.has-affected }}
      projects: ${{ steps.affected.outputs.projects }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - uses: nrwl/nx-set-shas@v4
      - name: Compute affected
        id: affected
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            PROJECTS=$(yarn nx show projects --json 2>/dev/null || echo '[]')
          else
            PROJECTS=$(yarn nx show projects --affected --json 2>/dev/null || echo '[]')
          fi
          {
            echo "projects<<EOF"
            echo "$PROJECTS"
            echo "EOF"
          } >> "$GITHUB_OUTPUT"
          if [ "$PROJECTS" = "[]" ]; then
            echo "has-affected=false" >> "$GITHUB_OUTPUT"
          else
            echo "has-affected=true" >> "$GITHUB_OUTPUT"
          fi

  check:
    name: Check (${{ matrix.task }})
    needs: [detect-affected]
    if: needs.detect-affected.outputs.has-affected == 'true'
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        task: [lint, test, 'format:check']
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - uses: nrwl/nx-set-shas@v4
      - name: Run ${{ matrix.task }}
        run: |
          if [ "${{ matrix.task }}" = "format:check" ]; then
            yarn format:check
          else
            yarn nx affected -t ${{ matrix.task }} --parallel
          fi

  build:
    name: Build
    needs: [check, detect-affected]
    if: |
      always() && !cancelled() &&
      needs.check.result != 'failure' &&
      needs.detect-affected.outputs.has-affected == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - uses: nrwl/nx-set-shas@v4
      - name: Build affected
        run: yarn nx affected -t build --parallel
```

- [ ] **Step 4: Release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

# On push to main, changesets/action opens / refreshes a "Version Packages"
# PR. When that PR merges (no pending changesets), the action runs
# `changeset publish` which publishes @idevconn/create-icore to npm with
# provenance attestation via OIDC trusted publishing.

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  id-token: write

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - name: Enable corepack
        run: corepack enable
      - name: Install
        run: yarn install --immutable
      - name: Build CLI
        run: yarn nx build create-icore
      - name: Clean deprecated npm config
        run: |
          npm config delete always-auth --location=user 2>/dev/null || true
          npm config delete always-auth --location=project 2>/dev/null || true
          rm -f .npmrc
      - name: Ensure npm has OIDC trusted publishing support
        run: npm install -g npm@latest
      - name: Create Release PR or publish
        uses: changesets/action@v1
        with:
          publish: npx changeset publish
          version: npx changeset version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: 'true'
```

The job DOES NOT need `NPM_TOKEN` because we use OIDC trusted publishing — the npm `package.json` `publishConfig.access` must be `public` (already set in Task 1) and the npm registry must have the GitHub Actions OIDC integration enabled for `@idevconn/create-icore`. Document this in the README.

- [ ] **Step 5: Sync main-to-dev workflow**

Copy `warranty/.github/workflows/sync-main-to-dev.yml` verbatim to `.github/workflows/sync-main-to-dev.yml`. Update the GitHub Actions notice text to reference `@idevconn/create-icore` if any string mentions warranty.

- [ ] **Step 6: Trigger sync from release**

Edit `release.yml` — after the `changesets/action@v1` step, add:

```yaml
- name: Trigger sync-main-to-dev workflow
  if: steps.changesets.outputs.published == 'true' || steps.changesets.outputs.hasChangesets == 'false'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: gh workflow run sync-main-to-dev.yml --ref main
```

(Adjust the step ID on changesets/action.)

This handles the `[skip ci]` problem warranty's pipeline calls out: when the release job pushes the version-bump commit, `[skip ci]` prevents normal push-triggered workflows from running, but `workflow_dispatch` from the release job bypasses that and keeps `dev` in sync.

- [ ] **Step 7: Add changeset for v0.1.0**

Create `.changeset/initial-release.md`:

```markdown
---
'@idevconn/create-icore': minor
---

Initial release: bootstrap CLI that scaffolds an icore monorepo with the chosen auth provider (Supabase / Firebase), storage provider (Supabase / Firebase / Cloudinary), microservice transport (TCP / Redis / NATS), and UI library (shadcn for v0.1.0; antd + mui fall back to shadcn until 6.1 / 6.2 ship).
```

- [ ] **Step 8: Commit + push**

```bash
git add .github .changeset
git commit -m "ci: pipeline + release + sync-main-to-dev workflows + initial changeset"
git push origin dev
```

After this lands on `dev` and is promoted to `main`, the release workflow will open a "Version Packages" PR; merging that publishes `@idevconn/create-icore@0.1.0` to npm.

## Task 8: Final verify + docs

- [ ] **Step 1: Full sweep**

```bash
cd /home/vladimir-tkach/Projects/icore
yarn nx run-many -t lint test build
yarn format:check
```

All green. Test count grows by ~10 (create-icore unit + integration).

- [ ] **Step 2: Update `docs/architecture.md`**

Flip Plan 7 row to ✅. Add a "Plan 7 deliverables" section describing the CLI shape, template snapshot mechanism, and the publish workflow.

- [ ] **Step 3: End-to-end manual smoke (optional)**

```bash
cd /tmp
node /home/vladimir-tkach/Projects/icore/tools/create-icore/dist/cli.js test-app --auth=supabase --storage=supabase --ui=shadcn --transport=tcp --no-git --no-install
ls test-app
```

The directory should contain the full monorepo with provider-specific `.env` files.

- [ ] **Step 4: Commit + push**

```bash
git add docs/architecture.md
git commit -m "docs: mark Plan 7 done, document @idevconn/create-icore CLI"
git push origin dev
```

---

## Self-Review Notes

**Spec coverage (spec section "create-icore CLI"):**

- Interactive prompts via `@clack/prompts` → Task 2 ✅
- Flag-based non-interactive mode → Task 2 (parseFlags) ✅
- Templates bundled in the npm tarball → Task 4 (snapshot at build) ✅
- Provider-specific `.env` written from `.env.example` → Task 3 ✅
- `git init` + initial commit → Task 3 ✅
- `yarn install` → Task 3 ✅
- Tests (unit + dry-run integration) → Tasks 5 + 6 ✅
- `tsup` build with `bin` entry → Task 4 ✅
- README + npm publishConfig → Tasks 7 + 1 ✅

**Deliberately deferred:**

- Antd + MUI templates (Plan 6.1 + 6.2). v0.1.0 CLI falls back to shadcn if the user picks antd/mui.
- Workspace dep hoisting in the shell `package.json` — v0.1.0 ships an empty deps block; consumers run `yarn install` against the per-app `package.json` workspaces.
- `npm publish` itself — done manually by the user after the final commit lands on `main`.
- E2E test against a real `npx @idevconn/create-icore` invocation in CI — needs the package on a registry first.

**Type consistency:**

- `CreateIcoreOptions` is the single source of truth for the CLI's runtime config.
- `AuthProvider` / `StorageProvider` / `UiLibrary` / `MsTransport` unions match the `*_PROVIDER` env values the upload + auth MSes read at boot.

**Out of scope:**

- Project rename (`@icore/*` → `@<projectname>/*`) — kept as `@icore/*` for v0.1.0 since the libs are internal-only. v0.2 may rename.
- Bucket / cloud auto-create — out of scope, documented in README.
