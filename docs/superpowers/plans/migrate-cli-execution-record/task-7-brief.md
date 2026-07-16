### Task 7: Wire `migrate` subcommand into `cli.ts`

**Files:**

- Create: `tools/create-icore/src/migrate/migrate-cli.ts`
- Modify: `tools/create-icore/src/cli.ts`
- Modify: `tools/create-icore/package.json` (move `semver` from `devDependencies` to `dependencies`)
- Modify: `tools/create-icore/eslint.config.mjs` (remove `'semver'` from `ignoredDependencies` — it's no longer build-tooling-only)
- Modify: `yarn.lock` (regenerated)

**Interfaces:**

- Consumes: `computePlan` (Task 1), `runMigrate`/`CodemodDeps` (Task 3), `createMigrateDeps`/`resolvePackageRoot` (Task 4), `RegistryFile`/`RegistryEntry` from `../migrations/build-registry.js`, `BlueprintJson` from `../manifest/blueprint.js`.
- Produces: `runMigrateCli(argv: string[], projectDir?: string): Promise<void>` — the CLI entry point calls this; nothing later depends on it.

- [ ] **Step 1: Reclassify `semver` as a real runtime dependency**

Edit `tools/create-icore/package.json`'s `dependencies`/`devDependencies` blocks from:

```json
"dependencies": {
  "@clack/prompts": "^1.6.0",
  "kleur": "^4.1.5"
},
"devDependencies": {
  "@changesets/parse": "^0.4.3",
  "@types/js-yaml": "^4.0.9",
  "@types/semver": "^7.7.1",
  "js-yaml": "^4.1.1",
  "minimatch": "^10.2.5",
  "semver": "^7.8.1",
  "tsup": "^8.5.1",
  "vitest": "^4.1.9"
}
```

to:

```json
"dependencies": {
  "@clack/prompts": "^1.6.0",
  "kleur": "^4.1.5",
  "semver": "^7.8.1"
},
"devDependencies": {
  "@changesets/parse": "^0.4.3",
  "@types/js-yaml": "^4.0.9",
  "@types/semver": "^7.7.1",
  "js-yaml": "^4.1.1",
  "minimatch": "^10.2.5",
  "tsup": "^8.5.1",
  "vitest": "^4.1.9"
}
```

Edit `tools/create-icore/eslint.config.mjs`'s `ignoredDependencies` — remove `'semver'`:

```js
ignoredDependencies: ['tsup', 'vitest', 'js-yaml', 'minimatch', '@changesets/parse'],
```

Run: `yarn install`
Expected: exits 0, `yarn.lock` updated (semver moves from one dependency block to another — content changes, no version bump needed since the version string itself is unchanged).

Run: `yarn nx lint create-icore`
Expected: 0 errors (semver is now a genuine declared dependency of a package that imports it — no allowlist needed, same as `@clack/prompts`/`kleur`)

- [ ] **Step 2: Write `migrate-cli.ts`**

Create `tools/create-icore/src/migrate/migrate-cli.ts`:

```typescript
import * as p from '@clack/prompts';
import kleur from 'kleur';
import semver from 'semver';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computePlan } from './plan.js';
import { runMigrate } from './run.js';
import { createMigrateDeps, resolvePackageRoot } from './migrate-deps.js';
import type { RegistryEntry, RegistryFile } from '../migrations/build-registry.js';
import type { BlueprintJson } from '../manifest/blueprint.js';

function parseMigrateFlags(argv: string[]): { to?: string } {
  const flags: { to?: string } = {};
  for (const arg of argv) {
    if (arg.startsWith('--to=')) flags.to = arg.slice('--to='.length);
    // --continue is a documented no-op: re-running this command always
    // resumes correctly on its own (progress is derived from git history,
    // never stored) — kept as a recognized flag purely for expectation
    // parity with `nx migrate`'s own --continue.
  }
  return flags;
}

function highestVersion(registry: RegistryFile): string {
  return registry.entries.reduce(
    (max, e) => (semver.gt(e.version, max) ? e.version : max),
    '0.0.0',
  );
}

async function loadRegistry(): Promise<RegistryFile> {
  const root = resolvePackageRoot();
  const raw = await readFile(join(root, 'migrations', 'registry.json'), 'utf8');
  return JSON.parse(raw) as RegistryFile;
}

function printAiPromptInstructions(entry: RegistryEntry): void {
  p.log.info(`Paused at migration "${entry.id}":`);
  p.log.info(entry.description);
  if (entry.diff) p.log.info(entry.diff);
  p.log.info('Apply this change to your project, adapting to any local customization.');
  p.log.info(`When done, commit your work with a message containing exactly: migrate: ${entry.id}`);
  p.log.info('Then re-run this same command to continue.');
}

export async function runMigrateCli(
  argv: string[],
  projectDir: string = process.cwd(),
): Promise<void> {
  const flags = parseMigrateFlags(argv);

  let blueprint: BlueprintJson;
  try {
    blueprint = JSON.parse(
      await readFile(join(projectDir, 'blueprint.json'), 'utf8'),
    ) as BlueprintJson;
  } catch {
    throw new Error(
      `No blueprint.json found in ${projectDir} — is this a create-icore-scaffolded project?`,
    );
  }

  const registry = await loadRegistry();
  const currentVersion = blueprint.generatorVersion ?? '0.0.0';
  const targetVersion = flags.to ?? highestVersion(registry);

  const projectAxes: Record<string, string> = {
    authProvider: blueprint.authProvider,
    dbProvider: blueprint.dbProvider,
    upload: blueprint.upload,
    payment: blueprint.payment,
    jobs: blueprint.jobs,
    example: blueprint.example,
    ui: blueprint.ui,
    transport: blueprint.transport,
  };

  const plan = computePlan(registry, currentVersion, targetVersion, projectAxes);
  const deps = createMigrateDeps();
  const result = await runMigrate(projectDir, plan, targetVersion, deps, printAiPromptInstructions);

  if (result === 'up-to-date') p.outro(kleur.green('Already up to date.'));
  else if (result === 'paused') p.outro(kleur.yellow('Paused — see instructions above.'));
  else p.outro(kleur.green(`Migrated to ${targetVersion}.`));
}
```

- [ ] **Step 3: Wire the subcommand branch into `cli.ts`**

In `tools/create-icore/src/cli.ts`, add the import alongside the existing ones:

```typescript
import { runMigrateCli } from './migrate/migrate-cli.js';
```

and change `async function main() {` from:

```typescript
async function main() {
  if (!existsSync(templatesDir)) {
```

to:

```typescript
async function main() {
  if (process.argv[2] === 'migrate') {
    await runMigrateCli(process.argv.slice(3));
    return;
  }

  if (!existsSync(templatesDir)) {
```

(The existing `main().catch((err) => { p.log.error(...); process.exit(1); })` at the bottom of the file already handles any error `runMigrateCli` throws — including the dirty-tree error from `runMigrate` and the missing-`blueprint.json` error above — no separate error handling needed in the new module.)

- [ ] **Step 4: Real end-to-end smoke test of the wired CLI**

```bash
yarn nx build create-icore
REPO_ROOT="$(pwd)"
SCRATCH=$(mktemp -d)
cd "$SCRATCH"
git init -q
git config user.email test@example.com
git config user.name Test
cat > blueprint.json <<'EOF'
{
  "schemaVersion": 1,
  "projectName": "scratch",
  "authProvider": "supabase",
  "dbProvider": "supabase",
  "upload": "none",
  "payment": "none",
  "jobs": "none",
  "example": "none",
  "ui": "shadcn",
  "transport": "tcp",
  "packageManager": "yarn",
  "generatorVersion": "0.0.0"
}
EOF
git add -A
git commit -q -m "init"
node "$REPO_ROOT/tools/create-icore/dist/cli.js" migrate --to 99.0.0
cd "$REPO_ROOT"
rm -rf "$SCRATCH"
```

(Run this from the repo root — `REPO_ROOT="$(pwd)"` captures it before `cd`-ing into the scratch dir, so the step works regardless of machine/checkout path.)

Expected: prints `Already up to date.` and exits 0 — the bundled `registry.json` has zero entries (no real migrations authored anywhere yet), so `computePlan` returns an empty list for any target version, proving the full wiring (subcommand dispatch → registry load → blueprint read → plan computation → orchestration) works end-to-end without needing real migration content to exist yet.

- [ ] **Step 5: Run the full test suite and lint**

Run: `yarn nx test create-icore`
Expected: PASS (all suites)

Run: `yarn nx lint create-icore`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/src/migrate/migrate-cli.ts tools/create-icore/src/cli.ts tools/create-icore/package.json tools/create-icore/eslint.config.mjs yarn.lock
git commit -m "feat(create-icore): wire migrate subcommand into the CLI"
```

---
