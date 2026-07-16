### Task 2: Migration entry schema + `.migration.yml` parser

**Files:**

- Create: `tools/create-icore/src/migrations/schema.ts`
- Create: `tools/create-icore/src/migrations/__tests__/schema.unit.test.ts`
- Modify: `tools/create-icore/package.json` (add `js-yaml` + `@types/js-yaml` devDependencies)
- Modify: `yarn.lock` (regenerated)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `MigrationKind = 'codemod' | 'ai-prompt'`, `MigrationEntry { id, kind, affectedAxes: string[], affectedGlobs: string[], commitRange, description }`, and `parseMigrationYaml(raw: string, sourcePath: string): MigrationEntry` — Task 3 imports this type and function.

- [ ] **Step 1: Add `js-yaml` + types as devDependencies**

Edit `tools/create-icore/package.json`'s `devDependencies` (currently `{ "tsup": "^8.5.1", "vitest": "^4.1.9" }`) to:

```json
"devDependencies": {
  "@types/js-yaml": "^4.0.9",
  "js-yaml": "^4.1.1",
  "tsup": "^8.5.1",
  "vitest": "^4.1.9"
}
```

Run: `yarn install`
Expected: exits 0, `yarn.lock` updated to include `js-yaml@^4.1.1` and `@types/js-yaml@^4.0.9`.

- [ ] **Step 2: Write the failing test**

Create `tools/create-icore/src/migrations/__tests__/schema.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseMigrationYaml } from '../schema.js';

const VALID_YAML = [
  'id: mui-9-2-icon-rename',
  'kind: codemod',
  'affectedAxes:',
  '  - "ui:mui"',
  'affectedGlobs:',
  '  - "apps/templates/client-mui/src/**/*.tsx"',
  'commitRange: "336161f..a1b2c3d"',
  'description: "Rename 3 icon imports for MUI v9."',
].join('\n');

describe('parseMigrationYaml', () => {
  it('parses a valid migration yaml', () => {
    const entry = parseMigrationYaml(VALID_YAML, '.changeset/mui-9-2-icon-rename.migration.yml');
    expect(entry).toEqual({
      id: 'mui-9-2-icon-rename',
      kind: 'codemod',
      affectedAxes: ['ui:mui'],
      affectedGlobs: ['apps/templates/client-mui/src/**/*.tsx'],
      commitRange: '336161f..a1b2c3d',
      description: 'Rename 3 icon imports for MUI v9.',
    });
  });

  it('throws when id is missing', () => {
    const yamlText = VALID_YAML.replace(/^id: .*$/m, '');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"id" must be a non-empty string/,
    );
  });

  it('throws when kind is invalid', () => {
    const yamlText = VALID_YAML.replace('kind: codemod', 'kind: rewrite-everything');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"kind" must be "codemod" or "ai-prompt"/,
    );
  });

  it('throws when affectedAxes is empty', () => {
    const yamlText = VALID_YAML.replace(/affectedAxes:\n\s+- "ui:mui"/, 'affectedAxes: []');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"affectedAxes" must be a non-empty array/,
    );
  });

  it('throws when affectedGlobs is empty', () => {
    const yamlText = VALID_YAML.replace(
      /affectedGlobs:\n\s+- "apps\/templates\/client-mui\/src\/\*\*\/\*\.tsx"/,
      'affectedGlobs: []',
    );
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"affectedGlobs" must be a non-empty array/,
    );
  });

  it('throws when commitRange is malformed', () => {
    const yamlText = VALID_YAML.replace('336161f..a1b2c3d', 'not-a-range');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(/"commitRange" must match/);
  });

  it('throws when description is missing', () => {
    const yamlText = VALID_YAML.replace(/^description: .*$/m, '');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"description" must be a non-empty string/,
    );
  });

  it('throws when top-level content is not a mapping', () => {
    expect(() => parseMigrationYaml('- just\n- a\n- list', 'bad.yml')).toThrow(
      /top-level content must be a YAML mapping/,
    );
  });

  it('throws with the source path in the error message', () => {
    expect(() =>
      parseMigrationYaml('not: valid\nkind: whatever', '.changeset/foo.migration.yml'),
    ).toThrow(/\.changeset\/foo\.migration\.yml/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn nx test create-icore -t "parseMigrationYaml"`
Expected: FAIL with "Cannot find module '../schema.js'" (or equivalent — the module doesn't exist yet)

- [ ] **Step 4: Implement `schema.ts`**

Create `tools/create-icore/src/migrations/schema.ts`:

```typescript
import * as yaml from 'js-yaml';

export type MigrationKind = 'codemod' | 'ai-prompt';

export interface MigrationEntry {
  id: string;
  kind: MigrationKind;
  affectedAxes: string[];
  affectedGlobs: string[];
  commitRange: string;
  description: string;
}

const COMMIT_RANGE_RE = /^[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}$/;

function fail(sourcePath: string, message: string): never {
  throw new Error(`Invalid migration entry in ${sourcePath}: ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

/**
 * Parses and validates a `.migration.yml` sibling file's raw text.
 * Throws on any missing/malformed field — the build step treats every
 * failure as release-blocking.
 */
export function parseMigrationYaml(raw: string, sourcePath: string): MigrationEntry {
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    fail(sourcePath, `not valid YAML (${err instanceof Error ? err.message : String(err)})`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail(sourcePath, 'top-level content must be a YAML mapping (object)');
  }
  const obj = parsed as Record<string, unknown>;

  if (!isNonEmptyString(obj['id'])) fail(sourcePath, '"id" must be a non-empty string');
  if (obj['kind'] !== 'codemod' && obj['kind'] !== 'ai-prompt') {
    fail(sourcePath, '"kind" must be "codemod" or "ai-prompt"');
  }
  if (!isNonEmptyStringArray(obj['affectedAxes'])) {
    fail(sourcePath, '"affectedAxes" must be a non-empty array of non-empty strings');
  }
  if (!isNonEmptyStringArray(obj['affectedGlobs'])) {
    fail(sourcePath, '"affectedGlobs" must be a non-empty array of non-empty strings');
  }
  if (
    !isNonEmptyString(obj['commitRange']) ||
    !COMMIT_RANGE_RE.test(obj['commitRange'] as string)
  ) {
    fail(sourcePath, '"commitRange" must match "<sha>..<sha>" (7-40 hex chars each side)');
  }
  if (!isNonEmptyString(obj['description'])) {
    fail(sourcePath, '"description" must be a non-empty string');
  }

  return {
    id: obj['id'] as string,
    kind: obj['kind'] as MigrationKind,
    affectedAxes: obj['affectedAxes'] as string[],
    affectedGlobs: obj['affectedGlobs'] as string[],
    commitRange: obj['commitRange'] as string,
    description: obj['description'] as string,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn nx test create-icore -t "parseMigrationYaml"`
Expected: PASS (all 9 cases)

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/package.json yarn.lock tools/create-icore/src/migrations/schema.ts tools/create-icore/src/migrations/__tests__/schema.unit.test.ts
git commit -m "feat(create-icore): add migration entry schema + .migration.yml parser"
```

---
