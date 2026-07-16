### Task 1: `plan.ts` — pure filtering/ordering

**Files:**

- Create: `tools/create-icore/src/migrate/plan.ts`
- Test: `tools/create-icore/src/migrate/__tests__/plan.unit.test.ts`

**Interfaces:**

- Consumes: `RegistryEntry`, `RegistryFile` from `../migrations/build-registry.js` (sub-project 1, already merged).
- Produces: `computePlan(registry, currentVersion, targetVersion, projectAxes): RegistryEntry[]` — Task 7 calls this directly.

- [ ] **Step 1: Write the failing test**

Create `tools/create-icore/src/migrate/__tests__/plan.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computePlan } from '../plan.js';
import type { RegistryEntry, RegistryFile } from '../../migrations/build-registry.js';

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'example',
    kind: 'codemod',
    affectedAxes: ['ui:mui'],
    affectedGlobs: ['apps/templates/client-mui/**'],
    commitRange: '1234567..89abcde',
    description: 'Example',
    version: '0.2.0',
    diff: '',
    ...over,
  };
}

describe('computePlan', () => {
  it('includes entries strictly above current version and up to (inclusive of) target', () => {
    const registry: RegistryFile = {
      entries: [
        entry({ id: 'too-old', version: '0.1.0' }),
        entry({ id: 'in-range', version: '0.2.0' }),
        entry({ id: 'at-target', version: '0.3.0' }),
        entry({ id: 'too-new', version: '0.4.0' }),
      ],
    };
    const plan = computePlan(registry, '0.1.5', '0.3.0', { ui: 'mui' });
    expect(plan.map((e) => e.id)).toEqual(['in-range', 'at-target']);
  });

  it('excludes an entry whose version equals currentVersion (strictly greater-than)', () => {
    const registry: RegistryFile = { entries: [entry({ id: 'same', version: '0.2.0' })] };
    const plan = computePlan(registry, '0.2.0', '0.3.0', { ui: 'mui' });
    expect(plan).toEqual([]);
  });

  it('filters out entries whose axes do not all match the project', () => {
    const registry: RegistryFile = {
      entries: [
        entry({ id: 'matches', affectedAxes: ['ui:mui'] }),
        entry({ id: 'wrong-ui', affectedAxes: ['ui:antd'] }),
        entry({ id: 'multi-axis-match', affectedAxes: ['ui:mui', 'authProvider:postgres'] }),
        entry({ id: 'multi-axis-partial', affectedAxes: ['ui:mui', 'authProvider:supabase'] }),
      ],
    };
    const plan = computePlan(registry, '0.0.0', '9.9.9', { ui: 'mui', authProvider: 'postgres' });
    expect(plan.map((e) => e.id)).toEqual(['matches', 'multi-axis-match']);
  });

  it('sorts the resulting plan by version ascending', () => {
    const registry: RegistryFile = {
      entries: [
        entry({ id: 'later', version: '0.5.0' }),
        entry({ id: 'earlier', version: '0.2.0' }),
      ],
    };
    const plan = computePlan(registry, '0.0.0', '9.9.9', { ui: 'mui' });
    expect(plan.map((e) => e.id)).toEqual(['earlier', 'later']);
  });

  it('returns an empty plan when nothing is in range', () => {
    const registry: RegistryFile = { entries: [entry({ version: '0.1.0' })] };
    expect(computePlan(registry, '0.5.0', '0.9.0', { ui: 'mui' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -t "computePlan"`
Expected: FAIL with "Cannot find module '../plan.js'"

- [ ] **Step 3: Implement `plan.ts`**

Create `tools/create-icore/src/migrate/plan.ts`:

```typescript
import semver from 'semver';
import type { RegistryEntry, RegistryFile } from '../migrations/build-registry.js';

/**
 * Filters the bundled registry to entries strictly newer than the project's
 * current generatorVersion, up to (inclusive of) the requested target, whose
 * affectedAxes all match the project's blueprint selections — sorted ascending.
 */
export function computePlan(
  registry: RegistryFile,
  currentVersion: string,
  targetVersion: string,
  projectAxes: Record<string, string>,
): RegistryEntry[] {
  return registry.entries
    .filter(
      (entry) =>
        semver.gt(entry.version, currentVersion) && semver.lte(entry.version, targetVersion),
    )
    .filter((entry) =>
      entry.affectedAxes.every((axis) => {
        const [axisName, unitId] = axis.split(':');
        return projectAxes[axisName] === unitId;
      }),
    )
    .sort((a, b) => semver.compare(a.version, b.version));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -t "computePlan"`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/migrate/plan.ts tools/create-icore/src/migrate/__tests__/plan.unit.test.ts
git commit -m "feat(create-icore): add migrate plan filtering (computePlan)"
```

---
