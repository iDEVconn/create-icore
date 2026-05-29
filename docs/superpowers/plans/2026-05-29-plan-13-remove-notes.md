# Remove Notes Sample — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--example=none` CLI flag to prevent scaffolding the notes sample, and ship a `yarn remove-notes` script inside every generated project so users can strip notes after the fact.

**Architecture:** Two paths: (A) `removeNotesStack()` in `scaffold.ts` — called at generate time when `--example=none` is passed, mirrors existing `removePaymentStack` / `removeJobsStack`; (C) `tools/remove-notes.mjs` — a plain-Node script baked into every generated project via the snapshot, registered as `yarn remove-notes`, handles the same files but operates from the generated project's root.

**Tech Stack:** TypeScript (CLI), plain Node.js ESM (generated-project script), Vitest (tests)

---

## File Map

### Changed in `tools/create-icore/` (Plan A)

| File                                                  | Change                                                   |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `src/lib/options.ts`                                  | Add `example: 'notes' \| 'none'` to `CreateIcoreOptions` |
| `src/lib/prompts.ts`                                  | Parse `--example` flag; add interactive prompt           |
| `src/lib/scaffold.ts`                                 | `removeNotesStack(targetDir)` + call in `scaffold()`     |
| `src/lib/__tests__/scaffold.unit.test.ts`             | Tests for `removeNotesStack`                             |
| `src/lib/__tests__/prompts.unit.test.ts`              | Tests for `--example` flag parsing                       |
| `src/lib/__tests__/scaffold.integration.unit.test.ts` | Integration test: `example=none` removes the stack       |

### Changed in icore root (Plan C — ships inside generated projects)

| File                                                | Change                                                     |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `tools/remove-notes.mjs`                            | **NEW** — post-generate removal script                     |
| `tools/create-icore/scripts/snapshot-templates.mjs` | Add `'tools/remove-notes.mjs'` to `PATHS_TO_COPY`          |
| `tools/create-icore/_template-shell/package.json`   | Add `"remove-notes": "node tools/remove-notes.mjs"` script |

---

## Task 1: `removeNotesStack()` — unit-tested scaffold function (Plan A core)

**Files:**

- Modify: `tools/create-icore/src/lib/scaffold.ts`
- Test: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`

- [ ] **Step 1: Write the failing test** in `scaffold.unit.test.ts`

Add this test after the existing `removeUploadStack` describe block:

```typescript
describe('removeNotesStack', () => {
  it('deletes ms, lib, gateway module and strips imports + deps + tsconfig path + nav + i18n', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-notes-'));

    // notes MS stub
    await mkdir(join(dir, 'apps/microservices/notes/src'), { recursive: true });
    await writeFile(join(dir, 'apps/microservices/notes/src/main.ts'), 'export {};');

    // notes-client lib stub
    await mkdir(join(dir, 'libs/notes-client/src'), { recursive: true });
    await writeFile(join(dir, 'libs/notes-client/src/index.ts'), 'export {};');

    // gateway notes module stub
    await mkdir(join(dir, 'apps/api/src/app/notes'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/src/app/notes/notes.module.ts'),
      'export class NotesModule {}',
    );

    // app.module.ts with NotesModule
    await mkdir(join(dir, 'apps/api/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/src/app/app.module.ts'),
      `import { AuthModule } from './auth/auth.module';\nimport { NotesModule } from './notes/notes.module';\n@Module({ imports: [AuthModule, NotesModule] })\nexport class AppModule {}`,
    );

    // api package.json with notes-client dep
    await mkdir(join(dir, 'apps/api'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/package.json'),
      JSON.stringify(
        { name: 'api', dependencies: { '@icore/notes-client': '*', '@icore/auth-client': '*' } },
        null,
        2,
      ),
    );

    // tsconfig.base.json with notes-client path
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{\n  "compilerOptions": {\n    "paths": {\n      "@icore/auth-client": ["./libs/auth-client/src/index.ts"],\n      "@icore/notes-client": ["./libs/notes-client/src/index.ts"]\n    }\n  }\n}`,
    );

    // client route + query stub
    await mkdir(join(dir, 'apps/client/src/routes/_dashboard'), { recursive: true });
    await writeFile(
      join(dir, 'apps/client/src/routes/_dashboard/notes.tsx'),
      'export const Route = {};',
    );
    await mkdir(join(dir, 'apps/client/src/queries'), { recursive: true });
    await writeFile(join(dir, 'apps/client/src/queries/notes.ts'), 'export {};');

    // notes components stub (shadcn only)
    await mkdir(join(dir, 'apps/client/src/components/notes'), { recursive: true });
    await writeFile(join(dir, 'apps/client/src/components/notes/NotesTable.tsx'), 'export {};');

    // LayoutSider with shadcn pattern
    await mkdir(join(dir, 'apps/client/src/components/layout'), { recursive: true });
    await writeFile(
      join(dir, 'apps/client/src/components/layout/LayoutSider.tsx'),
      `import { LayoutDashboard, StickyNote, User } from 'lucide-react';\n` +
        `export function LayoutSider() {\n  return (\n    <nav>\n` +
        `      <Link to="/_dashboard/notes"><StickyNote size={16} />{t('notes.title')}</Link>\n` +
        `    </nav>\n  );\n}`,
    );

    // i18n keys.ts with notes block
    await mkdir(join(dir, 'libs/template-shared/src/lib/i18n'), { recursive: true });
    await writeFile(
      join(dir, 'libs/template-shared/src/lib/i18n/keys.ts'),
      `export const ICORE_LOCALES = {\n  en: {\n    nav: { dashboard: 'Dashboard' },\n    notes: {\n      title: 'Notes',\n      new: 'New note',\n    },\n    error: { unknown: 'Error' },\n  },\n} as const;`,
    );

    await removeNotesStack(dir);

    // Backend removed
    await expect(access(join(dir, 'apps/microservices/notes'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/notes-client'))).rejects.toThrow();
    await expect(access(join(dir, 'apps/api/src/app/notes'))).rejects.toThrow();

    // Client files removed
    await expect(
      access(join(dir, 'apps/client/src/routes/_dashboard/notes.tsx')),
    ).rejects.toThrow();
    await expect(access(join(dir, 'apps/client/src/queries/notes.ts'))).rejects.toThrow();
    await expect(access(join(dir, 'apps/client/src/components/notes'))).rejects.toThrow();

    // app.module.ts stripped
    const mod = await readFile(join(dir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('NotesModule');
    expect(mod).toContain('AuthModule');

    // api package.json stripped
    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).not.toHaveProperty('@icore/notes-client');
    expect(pkg.dependencies).toHaveProperty('@icore/auth-client');

    // tsconfig path stripped
    const tsconfig = await readFile(join(dir, 'tsconfig.base.json'), 'utf8');
    expect(tsconfig).not.toContain('@icore/notes-client');
    expect(tsconfig).toContain('@icore/auth-client');

    // LayoutSider: StickyNote removed
    const sider = await readFile(
      join(dir, 'apps/client/src/components/layout/LayoutSider.tsx'),
      'utf8',
    );
    expect(sider).not.toContain('StickyNote');
    expect(sider).not.toContain('/_dashboard/notes');

    // i18n: notes block removed
    const keys = await readFile(join(dir, 'libs/template-shared/src/lib/i18n/keys.ts'), 'utf8');
    expect(keys).not.toContain('notes:');
    expect(keys).toContain('nav:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn nx test create-icore 2>&1 | grep -E "removeNotesStack|FAIL|pass"
```

Expected: FAIL — `removeNotesStack is not a function`

- [ ] **Step 3: Implement `removeNotesStack` in `scaffold.ts`**

Add after `removePaymentStack`:

```typescript
export async function removeNotesStack(targetDir: string): Promise<void> {
  // Delete directories (force:true silences missing-dir errors)
  for (const p of [
    'apps/microservices/notes',
    'libs/notes-client',
    'apps/api/src/app/notes',
    'apps/client/src/components/notes',
  ]) {
    await rm(join(targetDir, p), { recursive: true, force: true });
  }

  // Delete individual client files
  await rm(join(targetDir, 'apps/client/src/routes/_dashboard/notes.tsx'), { force: true });
  await rm(join(targetDir, 'apps/client/src/queries/notes.ts'), { force: true });

  // Strip NotesModule from gateway app.module.ts
  const appModulePath = join(targetDir, 'apps/api/src/app/app.module.ts');
  try {
    const src = await readFile(appModulePath, 'utf8');
    const next = src
      .replace(/^import \{ NotesModule \} from '\.\/notes\/notes\.module';\n/m, '')
      .replace(/,\s*NotesModule/g, '');
    await writeFile(appModulePath, next);
  } catch {
    // ignore — app.module.ts may not exist in test scaffolds
  }

  // Strip @icore/notes-client dep from api/package.json
  await stripDeps(join(targetDir, 'apps/api/package.json'), ['@icore/notes-client']);

  // Strip @icore/notes-client path from tsconfig.base.json
  const tsconfigPath = join(targetDir, 'tsconfig.base.json');
  try {
    const src = await readFile(tsconfigPath, 'utf8');
    const next = src.replace(/^\s*"@icore\/notes-client": \[[^\]]*\],?\n/m, '');
    await writeFile(tsconfigPath, next);
  } catch {
    // ignore
  }

  // Strip notes nav from LayoutSider — handles shadcn, antd and mui variants
  const siderPath = join(targetDir, 'apps/client/src/components/layout/LayoutSider.tsx');
  try {
    const src = await readFile(siderPath, 'utf8');
    const next = src
      // shadcn: remove StickyNote from lucide import + notes Link block
      .replace(', StickyNote', '')
      .replace(/\n {8}<Link\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/Link>/, '')
      // antd: remove FileTextOutlined + selectedKey notes branch + notes items entry
      .replace(', FileTextOutlined', '')
      .replace(
        "const selectedKey = pathname.includes('/notes')\n    ? 'notes'\n    : pathname.includes('/profile')",
        "const selectedKey = pathname.includes('/profile')",
      )
      .replace(
        "\n    {\n      key: 'notes',\n      icon: <FileTextOutlined />,\n      label: <Link to=\"/_dashboard/notes\">{t('notes.title')}</Link>,\n    },",
        '',
      )
      // mui: remove NoteOutlinedIcon import + notes ListItemButton
      .replace("import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';\n", '')
      .replace(
        /\n {8}<ListItemButton\n {10}component=\{Link\}\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/ListItemButton>/,
        '',
      );
    await writeFile(siderPath, next);
  } catch {
    // ignore
  }

  // Strip notes block from template-shared i18n keys.ts
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

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn nx test create-icore 2>&1 | tail -8
```

Expected: all tests pass including the new `removeNotesStack` test.

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/lib/scaffold.ts \
        tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts
git commit -m "feat(create-icore): removeNotesStack() — strips notes sample from generated project"
```

---

## Task 2: `--example` flag + prompt (Plan A CLI surface)

**Files:**

- Modify: `tools/create-icore/src/lib/options.ts`
- Modify: `tools/create-icore/src/lib/prompts.ts`
- Modify: `tools/create-icore/src/lib/scaffold.ts` (one line)
- Test: `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`

- [ ] **Step 1: Write failing test** in `prompts.unit.test.ts`

Add after the existing flag tests:

```typescript
it('parses --example=none', () => {
  expect(parseFlags(['my-app', '--example=none']).example).toBe('none');
});

it('parses --example=notes', () => {
  expect(parseFlags(['my-app', '--example=notes']).example).toBe('notes');
});

it('defaults notes to undefined when flag absent', () => {
  expect(parseFlags(['my-app']).example).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify fails**

```bash
yarn nx test create-icore 2>&1 | grep "notes"
```

Expected: FAIL — `notes` property undefined when expected `'none'`

- [ ] **Step 3: Update `options.ts`**

```typescript
export type ExampleMode = 'notes' | 'none';

export interface CreateIcoreOptions {
  projectName: string;
  targetDir: string;
  authProvider: AuthProvider;
  dbProvider: DbProvider;
  upload: UploadProvider;
  payment: PaymentProvider;
  jobs: JobsProvider;
  example: ExampleMode; // ← add this
  ui: UiLibrary;
  transport: MsTransport;
  initGit: boolean;
  install: boolean;
}
```

- [ ] **Step 4: Update `prompts.ts`** — add `notes` to `parseFlags` and `collectOptions`

In `parseFlags`, add inside the switch:

```typescript
case 'example':
  out.example = v as ExampleMode;
  break;
```

In `collectOptions`, add after the `jobs` prompt and before the `ui` prompt:

```typescript
const notes =
  flags.example ??
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

Add `example` to the return object:

```typescript
return {
  projectName,
  targetDir: resolve(cwd, projectName),
  authProvider,
  dbProvider,
  upload,
  payment,
  jobs,
  example, // ← add
  ui,
  transport,
  initGit,
  install,
};
```

Also add `ExampleMode` to the import from `./options.js`.

- [ ] **Step 5: Wire `removeNotesStack` into `scaffold()`**

In `scaffold.ts`, after `if (opts.jobs === 'none') await removeJobsStack(opts.targetDir);`, add:

```typescript
if (opts.example === 'none') await removeNotesStack(opts.targetDir);
```

- [ ] **Step 6: Run tests**

```bash
yarn nx test create-icore 2>&1 | tail -8
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/create-icore/src/lib/options.ts \
        tools/create-icore/src/lib/prompts.ts \
        tools/create-icore/src/lib/scaffold.ts \
        tools/create-icore/src/lib/__tests__/prompts.unit.test.ts
git commit -m "feat(create-icore): --example=none flag — skip notes sample at generate time"
```

---

## Task 3: Integration test for `example=none`

**Files:**

- Test: `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts`

- [ ] **Step 1: Extend `makeFakeTemplates` to include notes stubs**

Add inside `makeFakeTemplates()` after the mui template stub:

```typescript
// notes MS stub
await mkdir(join(tplDir, 'apps/microservices/notes/src'), { recursive: true });
await writeFile(join(tplDir, 'apps/microservices/notes/src/main.ts'), 'export {};');

// notes-client lib stub
await mkdir(join(tplDir, 'libs/notes-client/src'), { recursive: true });
await writeFile(join(tplDir, 'libs/notes-client/src/index.ts'), 'export {};');

// gateway notes module + app.module.ts with NotesModule
await mkdir(join(tplDir, 'apps/api/src/app/notes'), { recursive: true });
await writeFile(
  join(tplDir, 'apps/api/src/app/notes/notes.module.ts'),
  'export class NotesModule {}',
);
// Update the existing app.module.ts stub to include NotesModule
await writeFile(
  join(tplDir, 'apps/api/src/app/app.module.ts'),
  [
    "import { NotesModule } from './notes/notes.module';",
    "import { StorageModule } from './storage/storage.module';",
    "import { AuthModule } from './auth/auth.module';",
    '@Module({ imports: [AuthModule, StorageModule, NotesModule] })',
    'export class AppModule {}',
  ].join('\n'),
);

// client notes route + query in shadcn template
await mkdir(join(tplDir, 'apps/templates/client-shadcn/src/routes/_dashboard'), {
  recursive: true,
});
await writeFile(
  join(tplDir, 'apps/templates/client-shadcn/src/routes/_dashboard/notes.tsx'),
  'export const Route = {};',
);
await mkdir(join(tplDir, 'apps/templates/client-shadcn/src/queries'), { recursive: true });
await writeFile(join(tplDir, 'apps/templates/client-shadcn/src/queries/notes.ts'), 'export {};');
```

- [ ] **Step 2: Add integration test case**

Add a new `it` inside the `describe('scaffold (integration, dry-run)')` block:

```typescript
it('removes notes stack when example=none', async () => {
  const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'no-notes-app');
  await scaffold(
    {
      projectName: 'no-notes-app',
      targetDir: outputDir,
      authProvider: 'supabase',
      dbProvider: 'supabase',
      upload: 'supabase',
      payment: 'none',
      jobs: 'none',
      example: 'none',
      ui: 'shadcn',
      transport: 'tcp',
      initGit: false,
      install: false,
    },
    templatesDir,
  );

  // notes MS and lib gone
  await expect(access(join(outputDir, 'apps/microservices/notes'))).rejects.toThrow();
  await expect(access(join(outputDir, 'libs/notes-client'))).rejects.toThrow();

  // client notes route gone
  await expect(
    access(join(outputDir, 'apps/client/src/routes/_dashboard/notes.tsx')),
  ).rejects.toThrow();

  // app.module.ts has no NotesModule
  const mod = await readFile(join(outputDir, 'apps/api/src/app/app.module.ts'), 'utf8');
  expect(mod).not.toContain('NotesModule');

  // rest of scaffold intact
  const pkg = JSON.parse(await readFile(join(outputDir, 'package.json'), 'utf8')) as {
    name: string;
  };
  expect(pkg.name).toBe('no-notes-app');
});
```

- [ ] **Step 3: Run tests**

```bash
yarn nx test create-icore 2>&1 | tail -10
```

Expected: all tests pass (27 total now).

- [ ] **Step 4: Commit**

```bash
git add tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts
git commit -m "test(create-icore): integration coverage for example=none scaffold path"
```

---

## Task 4: `tools/remove-notes.mjs` — post-generate removal script (Plan C, hybrid)

**Hybrid approach:** `nx g @nx/workspace:remove` handles Nx project removal + tsconfig.base.json path cleanup. Custom logic handles everything that `nx g remove` doesn't touch: gateway module files, client UI files, nav, i18n, api package.json dep.

**Files:**

- Create: `tools/remove-notes.mjs` (icore root)

- [ ] **Step 1: Create the script**

```javascript
#!/usr/bin/env node
// Post-generate helper: removes the notes sample feature from a scaffolded project.
// Run from the project root: node tools/remove-notes.mjs  (or: yarn remove-notes)
import { rm, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function nx(args) {
  const result = spawnSync('yarn', ['nx', ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`nx ${args.join(' ')} exited with ${result.status}`);
  }
}

async function tryEdit(path, fn) {
  try {
    const src = await readFile(path, 'utf8');
    const next = fn(src);
    if (next !== src) await writeFile(path, next);
  } catch {
    // file may not exist (optional components)
  }
}

async function main() {
  // 1. Remove Nx projects via generator — handles dir deletion + tsconfig.base.json paths
  nx(['g', '@nx/workspace:remove', '--projectName=notes', '--no-interactive']);
  nx(['g', '@nx/workspace:remove', '--projectName=notes-client', '--no-interactive']);

  // 2. Delete non-Nx paths (gateway module + client UI) that nx g remove doesn't touch
  for (const p of ['apps/api/src/app/notes', 'apps/client/src/components/notes']) {
    await rm(join(root, p), { recursive: true, force: true });
  }
  for (const p of [
    'apps/client/src/routes/_dashboard/notes.tsx',
    'apps/client/src/queries/notes.ts',
  ]) {
    await rm(join(root, p), { force: true });
  }

  // 3. Strip NotesModule from gateway app.module.ts
  await tryEdit(join(root, 'apps/api/src/app/app.module.ts'), (src) =>
    src
      .replace(/^import \{ NotesModule \} from '\.\/notes\/notes\.module';\n/m, '')
      .replace(/,\s*NotesModule/g, ''),
  );

  // 4. Strip @icore/notes-client from api/package.json (nx g remove skips workspace deps)
  await tryEdit(join(root, 'apps/api/package.json'), (src) => {
    const pkg = JSON.parse(src);
    delete pkg?.dependencies?.['@icore/notes-client'];
    delete pkg?.devDependencies?.['@icore/notes-client'];
    return JSON.stringify(pkg, null, 2) + '\n';
  });

  // 5. Strip notes nav from LayoutSider (handles shadcn, antd, mui variants)
  await tryEdit(join(root, 'apps/client/src/components/layout/LayoutSider.tsx'), (src) =>
    src
      // shadcn: remove StickyNote icon + notes Link block
      .replace(', StickyNote', '')
      .replace(/\n {8}<Link\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/Link>/, '')
      // antd: remove FileTextOutlined + selectedKey notes check + notes items entry
      .replace(', FileTextOutlined', '')
      .replace(
        "const selectedKey = pathname.includes('/notes')\n    ? 'notes'\n    : pathname.includes('/profile')",
        "const selectedKey = pathname.includes('/profile')",
      )
      .replace(
        "\n    {\n      key: 'notes',\n      icon: <FileTextOutlined />,\n      label: <Link to=\"/_dashboard/notes\">{t('notes.title')}</Link>,\n    },",
        '',
      )
      // mui: remove NoteOutlinedIcon import + notes ListItemButton
      .replace("import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';\n", '')
      .replace(
        /\n {8}<ListItemButton\n {10}component=\{Link\}\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/ListItemButton>/,
        '',
      ),
  );

  // 6. Strip notes block from template-shared i18n keys.ts
  await tryEdit(join(root, 'libs/template-shared/src/lib/i18n/keys.ts'), (src) =>
    src.replace(/^\s{4}notes: \{\n(?:\s+.*\n)*?\s{4}\},\n/m, ''),
  );

  console.log('✓ Notes sample feature removed.');
  console.log('  Run `yarn nx run-many -t build` to verify the build is clean.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the script runs clean from the icore root** (smoke test)

```bash
node tools/remove-notes.mjs --help 2>&1 || node tools/remove-notes.mjs 2>&1 | head -5
```

Note: running it in icore root will modify icore source files — only run in a scratch copy. Instead, verify it only with `node --check tools/remove-notes.mjs` to syntax-check:

```bash
node --check tools/remove-notes.mjs && echo "syntax OK"
```

Expected: `syntax OK`

- [ ] **Step 3: Commit**

```bash
git add tools/remove-notes.mjs
git commit -m "feat: add tools/remove-notes.mjs — post-generate notes sample removal script"
```

---

## Task 5: Wire script into snapshot + generated project's package.json (Plan C integration)

**Files:**

- Modify: `tools/create-icore/scripts/snapshot-templates.mjs`
- Modify: `tools/create-icore/_template-shell/package.json`

- [ ] **Step 1: Add `tools/remove-notes.mjs` to `PATHS_TO_COPY`**

In `snapshot-templates.mjs`, add `'tools/remove-notes.mjs'` to the `PATHS_TO_COPY` array, after `'.dockerignore'`:

```javascript
const PATHS_TO_COPY = [
  // ... existing entries ...
  '.dockerignore',
  'tools/remove-notes.mjs', // ← add
];
```

- [ ] **Step 2: Add `remove-notes` script to `_template-shell/package.json`**

In `tools/create-icore/_template-shell/package.json`, inside `"scripts"`, add:

```json
"remove-notes": "node tools/remove-notes.mjs",
```

Full scripts block after the change:

```json
"scripts": {
  "dev": "nx run-many -t serve",
  "build": "nx run-many -t build",
  "lint": "nx run-many -t lint",
  "test": "nx run-many -t test",
  "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
  "format:check": "prettier --check \"**/*.{ts,tsx,md,json}\"",
  "remove-notes": "node tools/remove-notes.mjs",
  "prepare": "husky"
},
```

- [ ] **Step 3: Rebuild snapshot + verify it contains the script**

```bash
yarn nx build create-icore 2>&1 | tail -5
ls tools/create-icore/templates/tools/
```

Expected: `remove-notes.mjs` present in the templates.

- [ ] **Step 4: Verify `templates/package.json` has the new script**

```bash
grep "remove-notes" tools/create-icore/templates/package.json
```

Expected: `"remove-notes": "node tools/remove-notes.mjs"`

- [ ] **Step 5: Run full test suite**

```bash
yarn nx run-many -t test --exclude="*-e2e,client-shadcn,client-antd,client-mui" 2>&1 | tail -5
```

Expected: all projects pass.

- [ ] **Step 6: Lint**

```bash
yarn nx run-many -t lint --exclude="*-e2e,client-shadcn,client-antd,client-mui" 2>&1 | tail -3
```

Expected: `Successfully ran target lint for N projects`

- [ ] **Step 7: Commit**

```bash
git add tools/create-icore/scripts/snapshot-templates.mjs \
        tools/create-icore/_template-shell/package.json \
        tools/create-icore/templates/
git commit -m "feat(create-icore): ship remove-notes script in generated projects (yarn remove-notes)"
```

---

## Task 6: Changeset + docs update

**Files:**

- Create: `.changeset/feat-remove-notes.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Create changeset**

```markdown
---
'@idevconn/create-icore': minor
---

feat: --example=none flag and yarn remove-notes post-generate script

Pass `--example=none` at generate time to skip the notes CRUD sample entirely.
For existing projects, run `yarn remove-notes` to strip the notes MS, gateway
module, client routes/queries, nav item, and i18n keys in one pass.
```

Save to `.changeset/feat-remove-notes.md`.

- [ ] **Step 2: Update `docs/architecture.md` status table**

Add row to the status table:

```markdown
| 13 | `--example=none` flag + `yarn remove-notes` post-generate script | ✅ done |
```

- [ ] **Step 3: Final commit**

```bash
git add .changeset/feat-remove-notes.md docs/architecture.md
git commit -m "chore: changeset + docs for plan 13 (--example=none / yarn remove-notes)"
```

---

## Self-Review

**Spec coverage:**

- A (`--example=none` flag): Tasks 1, 2, 3 ✅
- C (post-generate script `yarn remove-notes`): Tasks 4, 5 ✅
- Changeset + docs: Task 6 ✅

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**

- `ExampleMode` defined in Task 2 Step 3 (`options.ts`) and referenced in Task 1 test, Task 3, and scaffold call — consistent.
- `removeNotesStack(targetDir: string)` signature consistent across Task 1 implementation, Task 2 wiring, and Task 3 test.
- `tools/remove-notes.mjs` path consistent in Task 4, 5 snapshot entry, and `_template-shell/package.json`.

**Gap check:** The `notes-e2e` directory is NOT in the snapshot `PATHS_TO_COPY`, so it won't be in generated projects — no removal needed. The `docker-compose.yml` has no notes service — no removal needed. Gateway `.env.example` has no `NOTES_*` vars — no cleanup needed.
