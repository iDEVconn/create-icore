### Task 2: `state.ts` — git-log-derived applied-check

**Files:**

- Create: `tools/create-icore/src/migrate/state.ts`
- Test: `tools/create-icore/src/migrate/__tests__/state.unit.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `isApplied(id: string, projectDir: string): Promise<boolean>` — Task 3's `CodemodDeps` interface and Task 4's `migrate-deps.ts` both reference this exact signature.

- [ ] **Step 1: Write the failing test**

Create `tools/create-icore/src/migrate/__tests__/state.unit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isApplied } from '../state.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

describe('isApplied', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'icore-migrate-state-'));
    await git(repoRoot, ['init', '-q']);
    await git(repoRoot, ['config', 'user.email', 'test@example.com']);
    await git(repoRoot, ['config', 'user.name', 'Test']);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('returns false when no commit exists at all', async () => {
    expect(await isApplied('foo-bar', repoRoot)).toBe(false);
  });

  it('returns false when no matching commit exists', async () => {
    await git(repoRoot, ['commit', '--allow-empty', '-q', '-m', 'unrelated commit']);
    expect(await isApplied('foo-bar', repoRoot)).toBe(false);
  });

  it('returns true for an exact-match commit', async () => {
    await git(repoRoot, ['commit', '--allow-empty', '-q', '-m', 'migrate: foo-bar']);
    expect(await isApplied('foo-bar', repoRoot)).toBe(true);
  });

  it('does not false-positive on a substring match (regression guard)', async () => {
    await git(repoRoot, ['commit', '--allow-empty', '-q', '-m', 'migrate: foo-barbaz']);
    expect(await isApplied('foo-bar', repoRoot)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -t "isApplied"`
Expected: FAIL with "Cannot find module '../state.js'"

- [ ] **Step 3: Implement `state.ts`**

Create `tools/create-icore/src/migrate/state.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * An entry counts as applied iff `projectDir`'s git history contains a
 * commit whose subject is EXACTLY `migrate: <id>`. Deliberately not
 * implemented via `git log --grep` — verified experimentally that no
 * combination of `--fixed-strings`/`^...$` gives exact-match semantics
 * (fixed-strings treats anchors as literal characters, so the pattern
 * then never matches; without fixed-strings, id substrings of a longer
 * real id false-positive). Exactness is enforced here instead.
 */
export async function isApplied(id: string, projectDir: string): Promise<boolean> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('git', ['log', '--format=%s'], { cwd: projectDir }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('does not have any commits yet')) return false;
    throw err;
  }
  const marker = `migrate: ${id}`;
  return stdout.split('\n').some((line) => line === marker);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -t "isApplied"`
Expected: PASS (all 4 cases)

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/migrate/state.ts tools/create-icore/src/migrate/__tests__/state.unit.test.ts
git commit -m "feat(create-icore): add git-log-derived migrate applied-check (isApplied)"
```

---
