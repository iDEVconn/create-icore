### Task 6: Ship codemods — dynamic `tsup` entries + `registry.json` in published files

**Files:**

- Modify: `tools/create-icore/tsup.config.ts`
- Modify: `tools/create-icore/package.json` (add `"migrations/registry.json"` to `files`)

**Interfaces:**

- Consumes: nothing from other tasks (pure build-tooling change).
- Produces: any `.ts` file later authored under `tools/create-icore/migrations/codemods/` compiles to a standalone `dist/migrations/codemods/<id>.js` — the exact path Task 4's `loadCodemod` already expects.

- [ ] **Step 1: Modify `tsup.config.ts`**

Change `tools/create-icore/tsup.config.ts` to:

```typescript
import { defineConfig } from 'tsup';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const { version: icoreVersion } = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string;
};

// Any .ts file under migrations/codemods/ compiles to its own standalone
// dist/migrations/codemods/<id>.js — this is what migrate-deps.ts's
// loadCodemod() dynamically imports at runtime from an end-user's
// installed package. No codemods exist yet (sub-project 1 and this plan
// both ship zero real entries), so this list is empty today and that's
// expected — the machinery just needs to be ready for the first one.
const here = dirname(fileURLToPath(import.meta.url));
const codemodsDir = join(here, 'migrations', 'codemods');
const codemodEntries: Record<string, string> = {};
if (existsSync(codemodsDir)) {
  for (const file of readdirSync(codemodsDir)) {
    if (file.endsWith('.ts')) {
      const id = basename(file, '.ts');
      codemodEntries[`migrations/codemods/${id}`] = join('migrations', 'codemods', file);
    }
  }
}

// Two entries with different output contracts:
//
// - `cli` is the bin script. It uses `import.meta.url` to resolve the
//   bundled `templates/` directory and pulls in `@clack/prompts` (ESM
//   only). Ship ESM only; no .d.ts.
// - `index` is the public library surface (`scaffold`, `collectOptions`,
//   `parseFlags`, option types). Ship dual ESM + CJS with .d.ts so
//   library consumers can `import` or `require` it.

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts', 'manifest/audit': 'src/manifest/audit.ts', ...codemodEntries },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: true,
    dts: false,
    shims: true,
    splitting: false,
    define: { ICORE_OWN_VERSION: JSON.stringify(icoreVersion) },
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    target: 'node20',
    outDir: 'dist',
    clean: false,
    dts: true,
    shims: true,
    splitting: false,
  },
]);
```

- [ ] **Step 2: Modify `package.json`'s `files` array**

In `tools/create-icore/package.json`, change:

```json
"files": [
  "dist",
  "templates",
  "README.md",
  "LICENSE"
],
```

to:

```json
"files": [
  "dist",
  "templates",
  "migrations/registry.json",
  "README.md",
  "LICENSE"
],
```

- [ ] **Step 3: Verify the dynamic codemod compilation with a real scratch fixture**

```bash
mkdir -p tools/create-icore/migrations/codemods
cat > tools/create-icore/migrations/codemods/__scratch_verification__.ts <<'EOF'
export default function scratchVerification(projectDir: string): void {
  void projectDir;
}
EOF
yarn nx build create-icore
```

Run: `test -f tools/create-icore/dist/migrations/codemods/__scratch_verification__.js && echo FOUND`
Expected: `FOUND`

- [ ] **Step 4: Remove the scratch fixture and rebuild to confirm it cleanly disappears**

```bash
rm tools/create-icore/migrations/codemods/__scratch_verification__.ts
rmdir tools/create-icore/migrations/codemods 2>/dev/null || true
yarn nx build create-icore
```

Run: `test -f tools/create-icore/dist/migrations/codemods/__scratch_verification__.js && echo STILL_THERE || echo GONE`
Expected: `GONE`

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `yarn nx test create-icore`
Expected: PASS (all suites, including Tasks 1-5's new tests)

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/tsup.config.ts tools/create-icore/package.json
git commit -m "feat(create-icore): compile migrations/codemods/*.ts as standalone dist entries, ship registry.json"
```

---
