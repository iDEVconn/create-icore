# Task 6 Report: Ship codemods — dynamic `tsup` entries + `registry.json` in published files

## Working directory / branch verification

```
pwd:    /home/vladimir-tkach/Projects/22/.claude/worktrees/feature+migrate-cli
branch: feature/migrate-cli
```

Confirmed correct before any work began.

## What changed

### `tools/create-icore/tsup.config.ts`

Added dynamic discovery of `.ts` files under `tools/create-icore/migrations/codemods/`, exactly per the brief:

- New imports: `existsSync`, `readdirSync` from `node:fs`; `dirname`, `join`, `basename` from `node:path`; `fileURLToPath` from `node:url`.
- Computes `here` via `fileURLToPath(import.meta.url)`, then `codemodsDir = join(here, 'migrations', 'codemods')`.
- If `codemodsDir` exists, walks it and adds one tsup entry per `.ts` file: `codemodEntries['migrations/codemods/<id>'] = 'migrations/codemods/<file>'`.
- Spread `...codemodEntries` into the first `defineConfig` entry block (same ESM-only, `dts: false` build group as `cli` and `manifest/audit`), so each codemod compiles to a standalone `dist/migrations/codemods/<id>.js` — the exact path Task 4's `loadCodemod()` expects.
- No other build-group settings changed (target, outDir, clean, shims, splitting, `ICORE_OWN_VERSION` define all untouched).

### `tools/create-icore/package.json`

Added `"migrations/registry.json"` to the published `files` array, between `"templates"` and `"README.md"`:

```json
"files": [
  "dist",
  "templates",
  "migrations/registry.json",
  "README.md",
  "LICENSE"
],
```

No other package.json fields touched.

## Verification (scratch fixture — steps 3 & 4 of the brief)

No real codemods exist yet in the repo (directory `tools/create-icore/migrations/codemods/` did not exist before this task), so per the brief's instructions a scratch fixture was used to prove the dynamic-entry machinery works, then removed before commit.

**Step 3 — create scratch fixture and build:**

```bash
mkdir -p tools/create-icore/migrations/codemods
cat > tools/create-icore/migrations/codemods/__scratch_verification__.ts <<'EOF'
export default function scratchVerification(projectDir: string): void {
  void projectDir;
}
EOF
yarn nx build create-icore
```

Build log confirmed tsup picked up the dynamic entry:

```
CLI Building entry: {"cli":"src/cli.ts","manifest/audit":"src/manifest/audit.ts","migrations/codemods/__scratch_verification__":"migrations/codemods/__scratch_verification__.ts"}
...
ESM dist/migrations/codemods/__scratch_verification__.js 160.00 B
ESM ⚡️ Build success in 102ms
```

FOUND check:

```bash
$ test -f tools/create-icore/dist/migrations/codemods/__scratch_verification__.js && echo FOUND
FOUND
```

**Step 4 — remove scratch fixture, rebuild, confirm disappearance:**

```bash
rm tools/create-icore/migrations/codemods/__scratch_verification__.ts
rmdir tools/create-icore/migrations/codemods 2>/dev/null || true
yarn nx build create-icore
```

Build log after removal shows the entry list back to just `cli` + `manifest/audit` (no codemod entries):

```
CLI Building entry: {"cli":"src/cli.ts","manifest/audit":"src/manifest/audit.ts"}
```

GONE check:

```bash
$ test -f tools/create-icore/dist/migrations/codemods/__scratch_verification__.js && echo STILL_THERE || echo GONE
GONE
```

Both checks passed exactly as expected. The scratch `.ts` file and the now-empty `migrations/codemods/` directory were fully removed before commit — nothing from the scratch fixture was left in the tree (`git status` confirmed clean aside from the two intended file diffs).

## Full test suite (step 5)

```
yarn nx test create-icore
```

Result: **26 test files passed (26), 237 tests passed (237)**, 0 failures. Includes all of Tasks 1–5's new suites (`src/migrate/__tests__/{state,plan,run,migrate-deps,migrate-e2e}.unit.test.ts`) plus every pre-existing suite (manifest, lib/scaffold, migrations/build-registry, migrations/schema, migrations/git-deps, etc.). No regressions from the tsup/package.json change.

## Lint

```
yarn nx lint create-icore
```

Result: `✔ All files pass linting` — 0 errors, 0 warnings.

## Build side-effect / template drift check

`yarn nx build create-icore` runs `build-migration-registry` and `snapshot-templates` as upstream Nx dependencies before the actual `tsup` build. The `snapshot-templates` step regenerated 4 files under `tools/create-icore/templates/` (drift unrelated to this task — a known build side-effect per project memory). These were discarded with `git checkout -- tools/create-icore/templates/` before staging, per the standing instruction to check/discard template drift as the last step before `git add`. Final `git status --porcelain` before commit showed only the two intended files (`tsup.config.ts`, `package.json`) modified.

`tools/create-icore/migrations/registry.json` itself was unaffected — it was already tracked from Task 5's build-registry wiring (commit `8cf7677`), contains `{"entries": []}`, and is correctly unchanged since zero real codemods exist yet.

## Commit

```
06998aa feat(create-icore): compile migrations/codemods/*.ts as standalone dist entries, ship registry.json
 2 files changed, 23 insertions(+), 2 deletions(-)
```

Working tree confirmed clean after commit; branch remained `feature/migrate-cli` throughout.
