### Task 5: End-to-end integration test (`runMigrate` + real `migrate-deps.ts`, two-invocation resume)

**Files:**

- Create: `tools/create-icore/src/migrate/__tests__/migrate-e2e.unit.test.ts`

**Interfaces:**

- Consumes: `computePlan` (Task 1), `runMigrate` (Task 3), `createMigrateDeps` (Task 4).
- Produces: nothing new — this task is pure verification that the pieces from Tasks 1, 3, and 4 compose correctly across a real pause/resume cycle.

- [ ] **Step 1: Write the test**

Create `tools/create-icore/src/migrate/__tests__/migrate-e2e.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { computePlan } from '../plan.js';
import { runMigrate } from '../run.js';
import { createMigrateDeps } from '../migrate-deps.js';
import type { RegistryFile } from '../../migrations/build-registry.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function gitLogSubjects(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['log', '--format=%s'], { cwd });
  return stdout.split('\n').filter((l) => l.length > 0);
}

describe('migrate end-to-end (real git, pause + resume)', () => {
  it('applies a codemod, pauses at an ai-prompt entry, then completes on a second run after the user commits manually', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'icore-migrate-e2e-proj-'));
    const packageRoot = await mkdtemp(join(tmpdir(), 'icore-migrate-e2e-pkgroot-'));

    try {
      await git(projectDir, ['init', '-q']);
      await git(projectDir, ['config', 'user.email', 'test@example.com']);
      await git(projectDir, ['config', 'user.name', 'Test']);
      await writeFile(
        join(projectDir, 'blueprint.json'),
        JSON.stringify({ schemaVersion: 1, generatorVersion: '0.1.0', ui: 'mui' }, null, 2) + '\n',
      );
      await git(projectDir, ['add', '-A']);
      await git(projectDir, ['commit', '-q', '-m', 'init']);

      await mkdir(join(packageRoot, 'dist', 'migrations', 'codemods'), { recursive: true });
      await writeFile(
        join(packageRoot, 'dist', 'migrations', 'codemods', 'bump-a-value.js'),
        `import { writeFile } from 'node:fs/promises';\n` +
          `import { join } from 'node:path';\n` +
          `export default async function (projectDir) {\n` +
          `  await writeFile(join(projectDir, 'bumped.txt'), 'yes');\n` +
          `}\n`,
      );

      const registry: RegistryFile = {
        entries: [
          {
            id: 'bump-a-value',
            kind: 'codemod',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['x/**'],
            commitRange: '1234567..89abcde',
            description: 'Bump a value',
            version: '0.2.0',
            diff: '',
          },
          {
            id: 'manual-fix',
            kind: 'ai-prompt',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['y/**'],
            commitRange: '89abcde..fedcba9',
            description: 'A change requiring judgment',
            version: '0.3.0',
            diff: '--- a/y/thing.ts\n+++ b/y/thing.ts\n',
          },
        ],
      };

      const deps = createMigrateDeps({ packageRoot });
      const plan1 = computePlan(registry, '0.1.0', '0.3.0', { ui: 'mui' });
      let pausedEntry: { id: string } | null = null;
      const result1 = await runMigrate(projectDir, plan1, '0.3.0', deps, (entry) => {
        pausedEntry = entry;
      });

      expect(result1).toBe('paused');
      expect(pausedEntry?.id).toBe('manual-fix');
      expect(await readFile(join(projectDir, 'bumped.txt'), 'utf8')).toBe('yes');
      expect(await gitLogSubjects(projectDir)).toContain('migrate: bump-a-value');
      const blueprintAfterPause = JSON.parse(
        await readFile(join(projectDir, 'blueprint.json'), 'utf8'),
      );
      expect(blueprintAfterPause.generatorVersion).toBe('0.1.0'); // not bumped yet

      // Simulate the user applying the ai-prompt entry through their own agent.
      await writeFile(join(projectDir, 'manual-change.txt'), 'done by hand');
      await git(projectDir, ['add', '-A']);
      await git(projectDir, ['commit', '-q', '-m', 'migrate: manual-fix']);

      const plan2 = computePlan(registry, '0.1.0', '0.3.0', { ui: 'mui' });
      const result2 = await runMigrate(projectDir, plan2, '0.3.0', deps, () => {
        throw new Error('should not pause again — both entries are already applied');
      });

      expect(result2).toBe('completed');
      const blueprintAfterComplete = JSON.parse(
        await readFile(join(projectDir, 'blueprint.json'), 'utf8'),
      );
      expect(blueprintAfterComplete.generatorVersion).toBe('0.3.0');
      expect(await gitLogSubjects(projectDir)).toContain('migrate: bump generatorVersion to 0.3.0');
    } finally {
      await rm(projectDir, { recursive: true, force: true });
      await rm(packageRoot, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `yarn nx test create-icore -t "migrate end-to-end"`
Expected: PASS (this exercises real git commits and a real dynamically-imported codemod file, spanning Tasks 1, 3, and 4 — if it fails, the bug is in how those pieces compose, not within any single task's own unit tests)

- [ ] **Step 3: Commit**

```bash
git add tools/create-icore/src/migrate/__tests__/migrate-e2e.unit.test.ts
git commit -m "test(create-icore): add migrate end-to-end pause/resume integration test"
```

---
