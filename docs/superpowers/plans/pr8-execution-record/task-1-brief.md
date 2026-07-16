### Task 1: Narrow `wire-provider.ts`'s error swallowing to ENOENT only

**Files:**
- Modify: `tools/create-icore/src/manifest/wire-provider.ts`
- Modify: `tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts`

**Root cause:** `mergeJsonDeps`, `stripJsonKeys`, and `stripTsconfigKeys` each wrap their entire body in a bare `try { ... } catch { /* pkg may be absent in partial fixtures */ }`. The comment is only true for `ENOENT` (file doesn't exist). A malformed JSON file, a permissions error, or a disk-full write failure would be silently swallowed identically — the generator would report success while actually failing to write the deps it was supposed to write, reproducing the exact class of bug PR5 fixed, with no error surfaced anywhere.

- [ ] **Step 1: Write the failing tests**

```typescript
// tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
// Add near the top, alongside existing imports:
import { writeFile as writeFileNode } from 'node:fs/promises';

// Add a new describe block, after the existing ones:
describe('mergeJsonDeps — error narrowing', () => {
  it('silently no-ops when the target file does not exist (ENOENT) — legitimate partial-fixture case', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-mergejsondeps-'));
    const missingPath = join(dir, 'does/not/exist/package.json');
    await expect(mergeJsonDeps(missingPath, { foo: '^1.0.0' })).resolves.toBeUndefined();
  });

  it('propagates a real error instead of swallowing it (malformed JSON)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-mergejsondeps-'));
    const badPath = join(dir, 'package.json');
    await writeFileNode(badPath, '{ not valid json');
    await expect(mergeJsonDeps(badPath, { foo: '^1.0.0' })).rejects.toThrow();
  });
});

describe('stripJsonKeys — error narrowing', () => {
  it('silently no-ops when the target file does not exist (ENOENT)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-stripjsonkeys-'));
    const missingPath = join(dir, 'does/not/exist/package.json');
    await expect(stripJsonKeys(missingPath, () => true)).resolves.toBeUndefined();
  });

  it('propagates a real error instead of swallowing it (malformed JSON)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-stripjsonkeys-'));
    const badPath = join(dir, 'package.json');
    await writeFileNode(badPath, '{ not valid json');
    await expect(stripJsonKeys(badPath, () => true)).rejects.toThrow();
  });
});

describe('stripTsconfigKeys — error narrowing', () => {
  it('silently no-ops when tsconfig.base.json does not exist (ENOENT)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-striptsconfig-'));
    await expect(stripTsconfigKeys(dir, ['@icore/x'])).resolves.toBeUndefined();
  });

  it('propagates a real error instead of swallowing it (malformed JSON)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-striptsconfig-'));
    await writeFileNode(join(dir, 'tsconfig.base.json'), '{ not valid json');
    await expect(stripTsconfigKeys(dir, ['@icore/x'])).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test create-icore -- wire-provider.unit.test.ts -t "error narrowing"`
Expected: FAIL — the 3 "propagates a real error" cases currently resolve instead of rejecting (the blanket `catch {}` swallows the `JSON.parse` failure).

- [ ] **Step 3: Narrow all three catches to ENOENT-only**

```typescript
// tools/create-icore/src/manifest/wire-provider.ts
function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Merges `deps` into a package.json's `dependencies`, creating the field if absent. */
export async function mergeJsonDeps(path: string, deps: Record<string, string>): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return; // pkg may be absent in partial fixtures
    throw err;
  }
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
  pkg.dependencies = { ...(pkg.dependencies ?? {}), ...deps };
  await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
}

export async function stripJsonKeys(path: string, drop: (k: string) => boolean): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return; // pkg may be absent in partial fixtures
    throw err;
  }
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const k of Object.keys(deps)) if (drop(k)) delete deps[k];
  }
  await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
}

export async function stripTsconfigKeys(targetDir: string, aliases: string[]): Promise<void> {
  const path = join(targetDir, 'tsconfig.base.json');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return; // tsconfig may be absent in partial fixtures
    throw err;
  }
  const parsed = JSON.parse(raw) as {
    compilerOptions?: { paths?: Record<string, unknown> };
  };
  const paths = parsed.compilerOptions?.paths;
  if (paths) for (const a of aliases) delete paths[a];
  await writeFile(path, JSON.stringify(parsed, null, 2) + '\n');
}
```

Note: `cleanupUnusedAxis` (below these three functions in the same file) is unchanged — it just calls `stripJsonKeys`/`stripTsconfigKeys`, and its own existing tests already only ever run against fixtures where these files exist and are valid, so this narrowing doesn't change its observable behavior in any existing passing test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test create-icore -- wire-provider.unit.test.ts`
Expected: PASS — all cases including the pre-existing `writeProvider`/`cleanupUnusedAxis` tests (they exercise the ENOENT-safe path implicitly by never hitting a missing/malformed file).

- [ ] **Step 5: Run the full create-icore suite to confirm no regression**

Run: `npx nx test create-icore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write tools/create-icore/src/manifest/wire-provider.ts tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
npx nx lint create-icore
git add tools/create-icore/src/manifest/wire-provider.ts tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
git commit -m "fix(scaffold): narrow wire-provider.ts's error swallowing to ENOENT only

mergeJsonDeps/stripJsonKeys/stripTsconfigKeys caught every error, not just
'file doesn't exist' — a malformed JSON or write failure would silently
reproduce the exact missing-dep bug PR5 fixed, with zero signal. Now only
ENOENT is treated as the documented 'partial fixture' no-op; everything
else propagates."
```

---

