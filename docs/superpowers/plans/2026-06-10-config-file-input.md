# Config File Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--config <path>` flag to `create-icore` CLI so users can pre-fill wizard answers from a JSON file, with individual CLI flags still taking priority and missing fields falling back to interactive prompts.

**Architecture:** New `config.ts` module owns `ConfigFileError`, `validateConfig()` (pure, no IO), and `loadConfig()` (reads file + calls validate). `parseFlags()` in `prompts.ts` gets one new `case 'config'` and an updated return type. `collectOptions()` reads the config file after parsing flags and merges it in before any prompts fire.

**Tech Stack:** Node.js `fs/promises`, Vitest, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `tools/create-icore/src/lib/config.ts` | **Create** | `ConfigFileError`, `validateConfig()`, `loadConfig()` |
| `tools/create-icore/src/lib/__tests__/config.unit.test.ts` | **Create** | Unit tests for validateConfig + loadConfig |
| `tools/create-icore/src/lib/prompts.ts` | **Modify** | Add `_configPath` to return type, `case 'config'` in switch, wire loadConfig in collectOptions |
| `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts` | **Modify** | Two new parseFlags tests for --config |
| `tools/create-icore/README.md` | **Modify** | Add `--config` row to flags table + CI mode section |
| `docs/architecture.md` | **Modify** | Add `--config` to non-interactive flags line |
| `.changeset/<slug>.md` | **Create** | `minor` bump for new feature |

---

## Task 1: Extend `parseFlags()` to capture `--config`

**Files:**
- Modify: `tools/create-icore/src/lib/prompts.ts:60-114`
- Modify: `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Add at the bottom of the `describe('parseFlags', ...)` block in `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`:

```typescript
it('reads --config <path> as space-separated', () => {
  expect(parseFlags(['--config', './base.json'])._configPath).toBe('./base.json');
});

it('reads --config=<path> as equals-separated', () => {
  expect(parseFlags(['--config=./base.json'])._configPath).toBe('./base.json');
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd tools/create-icore && npm run test -- --reporter=verbose 2>&1 | grep -E "FAIL|_configPath|config"
```

Expected: 2 failures — `_configPath` is `undefined`.

- [ ] **Step 3: Update return type and add `case 'config'`**

In `tools/create-icore/src/lib/prompts.ts`, change the function signature and internal type (lines 60–114). Replace:

```typescript
export function parseFlags(argv: string[]): Partial<CreateIcoreOptions> & { projectName?: string } {
  const out: Partial<CreateIcoreOptions> & { projectName?: string } = {};
```

with:

```typescript
export type ParsedFlags = Partial<CreateIcoreOptions> & { projectName?: string; _configPath?: string };

export function parseFlags(argv: string[]): ParsedFlags {
  const out: ParsedFlags = {};
```

Then add one case inside the `switch (key)` block, after the existing `case 'no-install':` case:

```typescript
      case 'config':
        out._configPath = v;
        break;
```

- [ ] **Step 4: Run tests — confirm new tests pass, no regressions**

```bash
cd tools/create-icore && npm run test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd tools/create-icore && npx prettier --write src/lib/prompts.ts src/lib/__tests__/prompts.unit.test.ts
cd tools/create-icore && npm run lint -- --quiet
git add tools/create-icore/src/lib/prompts.ts tools/create-icore/src/lib/__tests__/prompts.unit.test.ts
git commit -m "feat(create-icore): parseFlags captures --config path"
```

---

## Task 2: Create `config.ts` — `ConfigFileError` + `validateConfig()`

**Files:**
- Create: `tools/create-icore/src/lib/config.ts`
- Create: `tools/create-icore/src/lib/__tests__/config.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tools/create-icore/src/lib/__tests__/config.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { validateConfig, ConfigFileError } from '../config.js';

describe('validateConfig', () => {
  it('returns empty object for empty input', () => {
    expect(validateConfig({})).toEqual({});
  });

  it('accepts a full valid config', () => {
    const result = validateConfig({
      projectName: 'my-app',
      authProvider: 'supabase',
      dbProvider: 'firebase',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'antd',
      transport: 'nats',
      packageManager: 'npm',
      initGit: true,
      install: false,
    });
    expect(result).toEqual({
      projectName: 'my-app',
      authProvider: 'supabase',
      dbProvider: 'firebase',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'antd',
      transport: 'nats',
      packageManager: 'npm',
      initGit: true,
      install: false,
    });
  });

  it('accepts a partial config', () => {
    const result = validateConfig({ authProvider: 'mongodb', transport: 'kafka' });
    expect(result).toEqual({ authProvider: 'mongodb', transport: 'kafka' });
  });

  it('silently ignores unknown keys', () => {
    const result = validateConfig({ authProvider: 'supabase', unknownKey: 'value' });
    expect(result).toEqual({ authProvider: 'supabase' });
  });

  it('silently ignores targetDir', () => {
    const result = validateConfig({ authProvider: 'supabase', targetDir: '/some/path' });
    expect(result).toEqual({ authProvider: 'supabase' });
  });

  it('throws ConfigFileError for invalid authProvider', () => {
    expect(() => validateConfig({ authProvider: 'postgres' })).toThrowError(ConfigFileError);
    expect(() => validateConfig({ authProvider: 'postgres' })).toThrowError(
      'config field "authProvider" got "postgres", expected one of: supabase, firebase, mongodb',
    );
  });

  it('throws ConfigFileError for invalid dbProvider', () => {
    expect(() => validateConfig({ dbProvider: 'redis' })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError for invalid upload', () => {
    expect(() => validateConfig({ upload: 'aws-s3' })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError for invalid ui', () => {
    expect(() => validateConfig({ ui: 'bootstrap' })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError for invalid transport', () => {
    expect(() => validateConfig({ transport: 'grpc' })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError for projectName with invalid chars', () => {
    expect(() => validateConfig({ projectName: 'my app!' })).toThrowError(ConfigFileError);
    expect(() => validateConfig({ projectName: 'my app!' })).toThrowError('projectName');
  });

  it('throws ConfigFileError for non-boolean initGit', () => {
    expect(() => validateConfig({ initGit: 'yes' })).toThrowError(ConfigFileError);
    expect(() => validateConfig({ initGit: 'yes' })).toThrowError('"initGit" must be a boolean');
  });

  it('throws ConfigFileError for non-boolean install', () => {
    expect(() => validateConfig({ install: 1 })).toThrowError(ConfigFileError);
  });

  it('throws ConfigFileError when raw is not an object', () => {
    expect(() => validateConfig('string')).toThrowError(ConfigFileError);
    expect(() => validateConfig(42)).toThrowError(ConfigFileError);
    expect(() => validateConfig(null)).toThrowError(ConfigFileError);
    expect(() => validateConfig([])).toThrowError(ConfigFileError);
  });
});
```

- [ ] **Step 2: Run tests — confirm all fail (module missing)**

```bash
cd tools/create-icore && npm run test -- --reporter=verbose 2>&1 | grep -E "FAIL|Cannot find|config"
```

Expected: test file errors with "Cannot find module".

- [ ] **Step 3: Create `config.ts` with `ConfigFileError` and `validateConfig()`**

Create `tools/create-icore/src/lib/config.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import type {
  AuthProvider,
  DbProvider,
  UploadProvider,
  PaymentProvider,
  JobsProvider,
  ExampleMode,
  UiLibrary,
  MsTransport,
  PackageManager,
  CreateIcoreOptions,
} from './options.js';

export class ConfigFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigFileError';
  }
}

const AUTH_PROVIDERS: readonly AuthProvider[] = ['supabase', 'firebase', 'mongodb'];
const DB_PROVIDERS: readonly DbProvider[] = ['supabase', 'firebase', 'mongodb'];
const UPLOAD_PROVIDERS: readonly UploadProvider[] = [
  'supabase',
  'firebase',
  'cloudinary',
  'mongodb',
  'none',
];
const PAYMENT_PROVIDERS: readonly PaymentProvider[] = ['paypal', 'none'];
const JOBS_PROVIDERS: readonly JobsProvider[] = ['bullmq', 'none'];
const EXAMPLE_MODES: readonly ExampleMode[] = ['notes', 'none'];
const UI_LIBRARIES: readonly UiLibrary[] = ['shadcn', 'antd', 'mui'];
const MS_TRANSPORTS: readonly MsTransport[] = ['tcp', 'redis', 'nats', 'mqtt', 'rmq', 'kafka'];
const PACKAGE_MANAGERS: readonly PackageManager[] = ['yarn', 'npm', 'pnpm'];

function assertEnum<T extends string>(
  field: string,
  value: unknown,
  valid: readonly T[],
): T {
  if (typeof value !== 'string' || !valid.includes(value as T)) {
    throw new ConfigFileError(
      `config field "${field}" got "${String(value)}", expected one of: ${valid.join(', ')}`,
    );
  }
  return value as T;
}

function assertBoolean(field: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ConfigFileError(`config field "${field}" must be a boolean, got ${typeof value}`);
  }
  return value;
}

export function validateConfig(raw: unknown): Partial<CreateIcoreOptions> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigFileError('config file must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const result: Partial<CreateIcoreOptions> = {};

  if ('projectName' in obj) {
    const v = obj['projectName'];
    if (typeof v !== 'string' || !/^[a-z0-9-]+$/i.test(v)) {
      throw new ConfigFileError(
        `config field "projectName" must match /^[a-z0-9-]+$/i, got "${String(v)}"`,
      );
    }
    result.projectName = v;
  }
  if ('authProvider' in obj)
    result.authProvider = assertEnum('authProvider', obj['authProvider'], AUTH_PROVIDERS);
  if ('dbProvider' in obj)
    result.dbProvider = assertEnum('dbProvider', obj['dbProvider'], DB_PROVIDERS);
  if ('upload' in obj) result.upload = assertEnum('upload', obj['upload'], UPLOAD_PROVIDERS);
  if ('payment' in obj) result.payment = assertEnum('payment', obj['payment'], PAYMENT_PROVIDERS);
  if ('jobs' in obj) result.jobs = assertEnum('jobs', obj['jobs'], JOBS_PROVIDERS);
  if ('example' in obj) result.example = assertEnum('example', obj['example'], EXAMPLE_MODES);
  if ('ui' in obj) result.ui = assertEnum('ui', obj['ui'], UI_LIBRARIES);
  if ('transport' in obj)
    result.transport = assertEnum('transport', obj['transport'], MS_TRANSPORTS);
  if ('packageManager' in obj)
    result.packageManager = assertEnum('packageManager', obj['packageManager'], PACKAGE_MANAGERS);
  if ('initGit' in obj) result.initGit = assertBoolean('initGit', obj['initGit']);
  if ('install' in obj) result.install = assertBoolean('install', obj['install']);
  // targetDir is always derived from projectName + cwd — ignored if present

  return result;
}

export async function loadConfig(filePath: string): Promise<Partial<CreateIcoreOptions>> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    throw new ConfigFileError(`config file not found: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ConfigFileError(
      `config file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return validateConfig(parsed);
}
```

- [ ] **Step 4: Run tests — all `validateConfig` tests should pass**

```bash
cd tools/create-icore && npm run test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all `validateConfig` tests pass; `loadConfig` tests not written yet — that's Task 3.

- [ ] **Step 5: Commit**

```bash
cd tools/create-icore && npx prettier --write src/lib/config.ts src/lib/__tests__/config.unit.test.ts
cd tools/create-icore && npm run lint -- --quiet
git add tools/create-icore/src/lib/config.ts tools/create-icore/src/lib/__tests__/config.unit.test.ts
git commit -m "feat(create-icore): add ConfigFileError + validateConfig"
```

---

## Task 3: Add `loadConfig()` tests

**Files:**
- Modify: `tools/create-icore/src/lib/__tests__/config.unit.test.ts`

`loadConfig` does real IO — use temporary files (same pattern as `scaffold.unit.test.ts`).

- [ ] **Step 1: Add `loadConfig` tests to the existing test file**

Add a new `describe('loadConfig', ...)` block at the bottom of `tools/create-icore/src/lib/__tests__/config.unit.test.ts`:

```typescript
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'icore-config-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads and validates a valid JSON config file', async () => {
    const file = join(tmpDir, 'config.json');
    await writeFile(
      file,
      JSON.stringify({ authProvider: 'supabase', transport: 'nats' }),
      'utf8',
    );
    const result = await loadConfig(file);
    expect(result).toEqual({ authProvider: 'supabase', transport: 'nats' });
  });

  it('throws ConfigFileError when file does not exist', async () => {
    await expect(loadConfig(join(tmpDir, 'missing.json'))).rejects.toThrowError(ConfigFileError);
    await expect(loadConfig(join(tmpDir, 'missing.json'))).rejects.toThrowError(
      'config file not found',
    );
  });

  it('throws ConfigFileError for invalid JSON', async () => {
    const file = join(tmpDir, 'bad.json');
    await writeFile(file, '{ not json }', 'utf8');
    await expect(loadConfig(file)).rejects.toThrowError(ConfigFileError);
    await expect(loadConfig(file)).rejects.toThrowError('config file is not valid JSON');
  });

  it('throws ConfigFileError when JSON is valid but contains invalid field', async () => {
    const file = join(tmpDir, 'invalid-field.json');
    await writeFile(file, JSON.stringify({ authProvider: 'oracle' }), 'utf8');
    await expect(loadConfig(file)).rejects.toThrowError(ConfigFileError);
    await expect(loadConfig(file)).rejects.toThrowError('"authProvider"');
  });
});
```

Also update the existing imports at the top of the file:

```typescript
// replace:  import { describe, expect, it } from 'vitest';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

// replace:  import { validateConfig, ConfigFileError } from '../config.js';
import { validateConfig, loadConfig, ConfigFileError } from '../config.js';

// add new lines after existing vitest import:
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
```

- [ ] **Step 2: Run tests — confirm all pass**

```bash
cd tools/create-icore && npm run test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass including `loadConfig` suite.

- [ ] **Step 3: Commit**

```bash
cd tools/create-icore && npx prettier --write src/lib/__tests__/config.unit.test.ts
git add tools/create-icore/src/lib/__tests__/config.unit.test.ts
git commit -m "test(create-icore): add loadConfig unit tests"
```

---

## Task 4: Wire `loadConfig` into `collectOptions()`

**Files:**
- Modify: `tools/create-icore/src/lib/prompts.ts`

- [ ] **Step 1: Add import for `loadConfig`**

At the top of `tools/create-icore/src/lib/prompts.ts`, add after the existing imports:

```typescript
import { loadConfig } from './config.js';
```

- [ ] **Step 2: Add merge block inside `collectOptions()`**

In `collectOptions()`, after `const flags = parseFlags(argv);` (currently line 117), insert:

```typescript
  const configPath = flags._configPath;
  delete flags._configPath;

  if (configPath) {
    const configValues = await loadConfig(configPath);
    // Spread order: config values first, CLI flags win on top
    Object.assign(flags, { ...configValues, ...flags });
  }
```

The full function opening should now look like:

```typescript
export async function collectOptions({ argv, cwd }: PromptInput): Promise<CreateIcoreOptions> {
  const flags = parseFlags(argv);
  const configPath = flags._configPath;
  delete flags._configPath;

  if (configPath) {
    const configValues = await loadConfig(configPath);
    Object.assign(flags, { ...configValues, ...flags });
  }

  const [selfVersion, latestVersion] = await Promise.all([readSelfVersion(), fetchLatestVersion()]);
  // ... rest unchanged
```

- [ ] **Step 3: Run full test suite**

```bash
cd tools/create-icore && npm run test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Build to check TypeScript**

```bash
cd tools/create-icore && npm run build 2>&1 | tail -20
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd tools/create-icore && npx prettier --write src/lib/prompts.ts
cd tools/create-icore && npm run lint -- --quiet
git add tools/create-icore/src/lib/prompts.ts
git commit -m "feat(create-icore): wire --config file into collectOptions"
```

---

## Task 5: Update docs

**Files:**
- Modify: `tools/create-icore/README.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Add `--config` row to README flags table**

In `tools/create-icore/README.md`, find the flags table. Add a new row after the `--no-install` row:

```markdown
| `--config`     | path to `.json` file                               | —               | Pre-fill any wizard answer from a JSON file. Missing fields still prompt interactively. CLI flags override config values. See **Non-interactive / CI mode** below. |
```

- [ ] **Step 2: Add Non-interactive / CI mode section to README**

After the existing examples block (before `## Building`), add:

```markdown
## Non-interactive / CI mode

Pass `--config <path>` to skip individual prompts using a JSON file. Any field omitted from the file is still asked interactively. Individual CLI flags always override config file values.

```json
{
  "projectName": "demo-saas",
  "authProvider": "supabase",
  "dbProvider": "supabase",
  "upload": "cloudinary",
  "payment": "none",
  "jobs": "bullmq",
  "example": "notes",
  "ui": "shadcn",
  "transport": "nats",
  "packageManager": "yarn",
  "initGit": true,
  "install": false
}
```

```bash
# Fully non-interactive — all fields in config, no prompts
npx @idevconn/create-icore --config ./my-config.json

# CLI flag overrides config value (firebase wins over supabase in the file)
npx @idevconn/create-icore --auth firebase --config ./my-config.json
```

Field names mirror the TypeScript `CreateIcoreOptions` type. Unknown fields are silently ignored. `targetDir` is always derived from `projectName` + the working directory and is ignored if present.
```

- [ ] **Step 3: Update `docs/architecture.md`**

Find the line (≈ line 162) that reads:

```
- Non-interactive via flags: `--auth=supabase|firebase`, `--db=supabase|firebase`, ...
```

Append to that bullet (or the paragraph it belongs to):

```
`--config <path>` pre-fills any/all of these from a JSON file (field names match `CreateIcoreOptions`); missing fields fall back to interactive prompts; individual flags override config values.
```

- [ ] **Step 4: Commit docs**

```bash
npx prettier --write tools/create-icore/README.md docs/architecture.md
git add tools/create-icore/README.md docs/architecture.md
git commit -m "docs(create-icore): document --config flag and CI mode"
```

---

## Task 6: Changeset + final checks

**Files:**
- Create: `.changeset/config-file-input.md`

- [ ] **Step 1: Create changeset**

Create `.changeset/config-file-input.md`:

```markdown
---
"@idevconn/create-icore": minor
---

Add `--config <path>` flag for non-interactive / CI scaffolding from a JSON file
```

- [ ] **Step 2: Run full test suite one final time**

```bash
cd tools/create-icore && npm run test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 3: Run lint + build**

```bash
cd tools/create-icore && npm run lint -- --quiet && npm run build 2>&1 | tail -10
```

Expected: 0 errors, clean build.

- [ ] **Step 4: Commit changeset**

```bash
git add .changeset/config-file-input.md
git commit -m "chore: changeset for --config feature (minor)"
```
