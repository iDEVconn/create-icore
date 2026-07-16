### Task 1: `generatorVersion` field in `blueprint.json`

**Files:**

- Modify: `tools/create-icore/src/lib/prompts.ts` (export the existing `readSelfVersion`)
- Modify: `tools/create-icore/src/manifest/blueprint.ts`
- Modify: `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts`

**Interfaces:**

- Consumes: existing `readSelfVersion(): Promise<string | null>` (currently private to `prompts.ts:27`), existing `writeBlueprintJson(targetDir, opts)`.
- Produces: `BlueprintJson.generatorVersion: string` — later tasks/plans (the `migrate` CLI, out of scope here) will read this field to know "what version is this project currently at."

- [ ] **Step 1: Write the failing test — modify the existing `writeBlueprintJson` test**

Replace the first `it(...)` block in `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts` (currently lines 30-51) with:

```typescript
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ...(keep existing imports; add the two above alongside them)

describe('writeBlueprintJson', () => {
  it('writes blueprint.json with the chosen selection (no transient fields)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-bp-'));
    await writeBlueprintJson(dir, { ...opts, targetDir: dir });
    const bp = JSON.parse(await readFile(join(dir, 'blueprint.json'), 'utf8'));

    const here = dirname(fileURLToPath(import.meta.url));
    const ownPkg = JSON.parse(
      await readFile(join(here, '../../../package.json'), 'utf8'),
    ) as { version: string };

    expect(bp).toEqual({
      schemaVersion: 1,
      projectName: 'my-app',
      authProvider: 'firebase',
      dbProvider: 'mongodb',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'antd',
      transport: 'nats',
      packageManager: 'pnpm',
      generatorVersion: ownPkg.version,
    });
    // transient fields excluded
    expect(bp).not.toHaveProperty('targetDir');
    expect(bp).not.toHaveProperty('install');
    expect(bp).not.toHaveProperty('initGit');
  });
```

Leave the second test (`'is deterministic (no timestamp) — two writes byte-match'`) unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -t "writes blueprint.json"`
Expected: FAIL — `bp` is missing the `generatorVersion` key the assertion now expects.

- [ ] **Step 3: Export `readSelfVersion` from `prompts.ts`**

In `tools/create-icore/src/lib/prompts.ts:27`, change:

```typescript
async function readSelfVersion(): Promise<string | null> {
```

to:

```typescript
export async function readSelfVersion(): Promise<string | null> {
```

- [ ] **Step 4: Add `generatorVersion` to `blueprint.ts`**

In `tools/create-icore/src/manifest/blueprint.ts`, change the top imports and `BlueprintJson`/`writeBlueprintJson` to:

```typescript
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreateIcoreOptions } from '../lib/options.js';
import { readSelfVersion } from '../lib/prompts.js';

export interface BlueprintJson {
  schemaVersion: 1;
  projectName: string;
  authProvider: string;
  dbProvider: string;
  upload: string;
  payment: string;
  jobs: string;
  example: string;
  ui: string;
  transport: string;
  packageManager: string;
  generatorVersion: string;
}

/**
 * Record the scaffold selection at the project root. A provenance + audit-input
 * artifact ("what was this generated with?"). Transient fields (targetDir,
 * install, initGit) are excluded; no timestamp, so output is deterministic.
 * `generatorVersion` anchors a future `create-icore migrate` command — a
 * project missing this field (pre-existing scaffolds) is treated as version 0.
 */
export async function writeBlueprintJson(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const generatorVersion = (await readSelfVersion()) ?? '0.0.0';
  const blueprint: BlueprintJson = {
    schemaVersion: 1,
    projectName: opts.projectName,
    authProvider: opts.authProvider,
    dbProvider: opts.dbProvider,
    upload: opts.upload,
    payment: opts.payment,
    jobs: opts.jobs,
    example: opts.example,
    ui: opts.ui,
    transport: opts.transport,
    packageManager: opts.packageManager,
    generatorVersion,
  };
  await writeFile(join(targetDir, 'blueprint.json'), JSON.stringify(blueprint, null, 2) + '\n');
}
```

(The rest of the file — `writeJson` and `writeServiceBlueprints` — is unchanged.)

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn nx test create-icore -t "writeBlueprintJson"`
Expected: PASS (both tests in the `describe('writeBlueprintJson', ...)` block)

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/src/lib/prompts.ts tools/create-icore/src/manifest/blueprint.ts tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts
git commit -m "feat(create-icore): record generatorVersion in blueprint.json"
```

---
