### Task 5: Entrypoint script + `nx` target wiring

**Files:**

- Create: `tools/create-icore/scripts/build-migration-registry.ts`
- Modify: `tools/create-icore/project.json`

**Interfaces:**

- Consumes: `buildRegistry` (Task 3, `../src/migrations/build-registry.js`), `createGitDeps` (Task 4, `../src/migrations/git-deps.js`).
- Produces: `tools/create-icore/migrations/registry.json` (real, committed artifact) and an `nx` target other tooling/CI can depend on.

- [ ] **Step 1: Write the entrypoint script**

Create `tools/create-icore/scripts/build-migration-registry.ts`:

```typescript
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { buildRegistry } from '../src/migrations/build-registry.js';
import { createGitDeps } from '../src/migrations/git-deps.js';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '../../..');
  const deps = await createGitDeps(repoRoot);
  const registry = await buildRegistry(deps);
  const outPath = join(repoRoot, 'tools/create-icore/migrations/registry.json');
  await writeFile(outPath, JSON.stringify(registry, null, 2) + '\n');
  const count = registry.entries.length;
  console.log(`Wrote ${count} migration entr${count === 1 ? 'y' : 'ies'} to ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Wire the `nx` target**

In `tools/create-icore/project.json`, add a new target alongside `snapshot-templates` and make `build` depend on it too:

```json
{
  "name": "create-icore",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "tools/create-icore/src",
  "projectType": "library",
  "tags": [],
  "targets": {
    "snapshot-templates": {
      "executor": "nx:run-commands",
      "options": {
        "command": "node tools/create-icore/scripts/snapshot-templates.mjs"
      }
    },
    "build-migration-registry": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx tools/create-icore/scripts/build-migration-registry.ts"
      },
      "outputs": ["{projectRoot}/migrations/registry.json"]
    },
    "build": {
      "dependsOn": ["snapshot-templates", "build-migration-registry"],
      "executor": "nx:run-commands",
      "options": {
        "command": "tsup --config tools/create-icore/tsup.config.ts",
        "cwd": "tools/create-icore"
      },
      "outputs": ["{projectRoot}/dist", "{projectRoot}/templates"]
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "outputs": ["{options.outputFile}"]
    },
    "test": {
      "executor": "@nx/vitest:test",
      "outputs": ["{options.reportsDirectory}"],
      "options": {
        "reportsDirectory": "../../coverage/tools/create-icore"
      }
    }
  }
}
```

- [ ] **Step 3: Run the target for real and verify it produces an empty registry**

No `.migration.yml` files exist in the repo yet (backfilling real entries is explicitly out of scope for this plan), so this run should succeed with zero entries — proving the wiring works end-to-end without depending on any not-yet-authored content.

Run: `yarn nx run create-icore:build-migration-registry`
Expected: exits 0, prints `Wrote 0 migration entries to .../tools/create-icore/migrations/registry.json`

Run: `cat tools/create-icore/migrations/registry.json`
Expected:

```json
{
  "entries": []
}
```

- [ ] **Step 4: Run the full create-icore test suite to confirm nothing else broke**

Run: `yarn nx test create-icore`
Expected: PASS (all suites, including Tasks 1-4's new tests)

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/scripts/build-migration-registry.ts tools/create-icore/project.json tools/create-icore/migrations/registry.json
git commit -m "feat(create-icore): wire migration registry build script into nx build target"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (`generatorVersion`) → Task 1. §2 (sibling-file schema + parser) → Task 2. §3 (codemod convention) → enforced by Task 3's `codemodExists` check + Global Constraints note (no separate task needed — there's no codemod content to write yet, out of scope). §4 (build script + ordering) → Tasks 3-5. Error handling matrix → Task 3's 10 test cases + Task 4's real-git integration tests. Testing section → covered across all 4 test files. Out-of-scope items are not implemented anywhere in this plan.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `RegistryEntry`/`RegistryFile`/`ChangesetPair`/`ChangesetRelease`/`BuildRegistryDeps` are defined once in Task 3 and imported (never redefined) by Task 4 and Task 5's usage. `MigrationEntry`/`MigrationKind` defined once in Task 2, imported by Task 3.
