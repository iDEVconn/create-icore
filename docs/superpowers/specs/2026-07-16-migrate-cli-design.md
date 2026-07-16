# create-icore `migrate` CLI — Design

## Context

Sub-project 1 (`docs/superpowers/specs/2026-07-16-migrate-registry-design.md`, shipped PR #249) built the data pipeline: `blueprint.json` records a `generatorVersion`, migration metadata is authored as `.changeset/<slug>.migration.yml` sibling files, and a build step bakes them into a versioned `tools/create-icore/migrations/registry.json` — each entry tagged `kind: codemod` (context-free textual substitution) or `kind: ai-prompt` (anything requiring surrounding-code judgment, handed to the user's own coding agent rather than run by us).

This spec is sub-project 2: the `create-icore migrate` command that actually consumes `registry.json` inside an already-scaffolded project and walks it forward. No real registry entries exist yet (sub-project 1 shipped zero, deliberately) and none are authored here either — this spec builds only the mechanism, validated via fixtures, mirroring sub-project 1's own scope discipline.

### Reference architecture

`nx migrate` (researched via `nx_docs` during sub-project 1's brainstorm): `migrations.json` maps target versions to migration generators, applied sequentially, git-checkpointed, human accept/undo per step, requires a clean tree. This spec borrows the shape (sequential, git-checkpointed, human-gated) but replaces Nx's Console-UI accept/undo with something appropriate for a plain CLI, and replaces Nx's explicit run-state tracking with a simpler mechanism (see Decision Record).

### Decision record

**Registry delivery:** `tools/create-icore/migrations/registry.json` is added to the published npm package's `package.json` `files` array (alongside `dist`, `templates`) so `migrate` reads its own installed copy locally — no network fetch, no extra latency/failure-mode, at the cost of only ever seeing the registry as of whichever `create-icore` version the user has installed (identical to how `nx migrate` only sees the installed plugin's own `migrations.json`).

**CLI syntax:** `npx create-icore migrate [--to <version>] [--continue]`, flag-style consistent with this repo's existing `--auth=`/`--ui=` scaffold flags. `--to` defaults to the latest version present in the bundled registry.

**Progress tracking — stateless, git-log-derived (chosen over an explicit state file):** an entry counts as applied if `git log` (in the target project) contains a commit whose message is exactly `migrate: <id>`. Since the pending sequence is fully deterministic from `(blueprint.json.generatorVersion, --to target, blueprint's axis selections, the bundled registry's content)`, `migrate` recomputes it fresh on every invocation rather than persisting a separate state file. This was chosen over an explicit `.icore-migrate/state.json` because: (a) it can never desync from git history — they're the same data — where a state file could go stale if a user manually reverted a commit; (b) it needs no schema of its own to design, version, or ever migrate; (c) it's a natural extension of this project's existing "git is the checkpoint" philosophy from sub-project 1's git-diff-based approach. One consequence: `--continue` becomes a documented no-op alias — plain re-invocation of `migrate --to <version>` always resumes correctly on its own. Kept as an explicit flag anyway for clarity/expectation-parity with `nx migrate`'s own `--continue` semantics.

**Step-completion gate for `ai-prompt` entries:** confirmed via the same git-log-marker mechanism as everything else — `migrate` prints, as part of its stop message, the exact commit-message convention required (`migrate: <id>`) for the user's own coding agent to use once it applies the change.

## Design

### 1. Command entry

`create-icore migrate` is a new subcommand on the same published CLI binary (`tools/create-icore/src/cli.ts`). At startup, branch on `argv[0] === 'migrate'`: enter migrate mode (this spec) instead of the existing interactive/flag-driven scaffold-prompt flow. Migrate mode never prompts interactively — it's fully flag-driven and script-friendly (matches `nx migrate --run-migrations`'s non-interactive mode, not the Nx Console UI's accept/undo dialog, since this is a plain terminal CLI).

Flags: `--to <version>` (optional, defaults to the highest version present in the bundled registry), `--continue` (optional, no-op — documented purely for expectation-parity, has zero effect on behavior since resumption is automatic).

### 2. `plan.ts` — pure filtering/ordering logic

```typescript
export interface MigratePlanEntry extends RegistryEntry {} // re-exported shape from sub-project 1's registry

export function computePlan(
  registry: RegistryFile,
  currentVersion: string,
  targetVersion: string,
  projectAxes: Record<string, string>, // e.g. { ui: 'mui', authProvider: 'postgres', ... } — read straight off blueprint.json's own fields
): MigratePlanEntry[]
```

Filters `registry.entries` to `semver.gt(entry.version, currentVersion) && semver.lte(entry.version, targetVersion)`, further filtered to entries where every string in `entry.affectedAxes` (format `"<axisName>:<unitId>"`, e.g. `"ui:mui"`) matches `projectAxes[axisName] === unitId`, sorted ascending by version via `semver.compare`. Pure function, no I/O — fully unit-testable against fixture registries.

`currentVersion` comes from the target project's own `blueprint.json.generatorVersion` (missing field → treated as `'0.0.0'`, meaning every entry in range applies — matches sub-project 1's spec for pre-existing scaffolds).

### 3. `state.ts` — git-log-derived applied-check

```typescript
export async function isApplied(id: string, projectDir: string): Promise<boolean>
```

**Correction from initial draft:** the natural-seeming `git log --grep "^migrate: ${id}$" --fixed-strings` is actually broken — verified experimentally (a scratch repo, real `git` invocations). `--fixed-strings` disables regex interpretation entirely, so the `^`/`$` anchors are matched as **literal** caret/dollar characters, which never appear in a real commit subject — the pattern then matches nothing, ever, for any commit. Dropping the anchors and keeping `--fixed-strings` fixes that, but reintroduces a different bug: `--fixed-strings` still does *substring* matching, so id `"foo-bar"` would incorrectly match a real commit `"migrate: foo-barbaz"`.

Correct implementation: fetch every commit subject via `git log --format=%s` in `projectDir`, split into lines, and check for an exact equality match against `` `migrate: ${id}` `` in JS — no grep flag combination gives exact-match semantics safely, so exactness is enforced in application code instead.

### 4. `run.ts` — orchestration

```typescript
export interface CodemodDeps {
  loadCodemod(id: string): Promise<(projectDir: string) => void | Promise<void>>;
  isApplied(id: string, projectDir: string): Promise<boolean>;
  commit(projectDir: string, message: string): Promise<void>;
  isTreeClean(projectDir: string): Promise<boolean>;
}

export async function runMigrate(
  projectDir: string,
  plan: MigratePlanEntry[],
  targetVersion: string,
  deps: CodemodDeps,
): Promise<'completed' | 'paused' | 'up-to-date'>
```

1. If `plan.length === 0`: return `'up-to-date'` (print "already up to date").
2. `if (!(await deps.isTreeClean(projectDir))) throw new Error('...')` — dirty tree aborts before touching anything.
3. For each entry in `plan`, in order:
   - `if (await deps.isApplied(entry.id, projectDir)) continue;` (already done — from this run or a prior one — skip silently past it)
   - `entry.kind === 'codemod'`: `const fn = await deps.loadCodemod(entry.id); await fn(projectDir); await deps.commit(projectDir, \`migrate: ${entry.id}\`);` then continue the loop (auto-chain to the next entry).
   - `entry.kind === 'ai-prompt'`: print `entry.description`, `entry.diff`, and the fixed instruction: `` Apply this change to your project, adapting to any local customization. When done, commit your work with a message containing exactly: `migrate: ${entry.id}` `` — then `return 'paused'` (exit the function; the CLI wrapper exits 0, this is a normal pause, not a failure).
4. If the loop finishes without pausing: bump `blueprint.json.generatorVersion` to `targetVersion`, `deps.commit(projectDir, \`migrate: bump generatorVersion to ${targetVersion}\`)`, return `'completed'`.

A codemod's own function throwing propagates out of `runMigrate` uncaught — the CLI wrapper catches it at the top level, prints the error + the failing entry's `id`, and exits non-zero. This is deliberate: a codemod is specified (sub-project 1's spec, §3) to be narrow/anchor-based and to degrade to a no-op-with-warning when its target pattern isn't found — an actual thrown error means something genuinely unexpected happened, and `migrate` should stop rather than silently skip, mirroring `nx migrate`'s pause-on-error behavior. There is no `--skip` flag: skipping an entry a user has decided not to apply is just manually running `git commit --allow-empty -m "migrate: <id>"` themselves — an emergent capability of the stateless git-log design, not a feature `migrate` needs to implement.

### 5. Codemod convention (unchanged from sub-project 1's spec)

`kind: codemod` entries load `tools/create-icore/migrations/codemods/<id>.js` (compiled from the `.ts` source sub-project 1 already specified), calling its default export `(projectDir: string) => void | Promise<void>`.

## Error handling

- Dirty git tree at start → abort, instruct the user to commit or stash first.
- `--to` version not found in the bundled registry, or resolves to an empty plan → `'up-to-date'`, no-op, not an error.
- Codemod throws → propagate, print entry id + error, exit non-zero, do not mark the entry applied (no commit was made for it).
- Bundled `registry.json` missing/unreadable from the installed package → clear error naming the expected path (defensive; shouldn't happen once `package.json` `files` includes it, per Decision Record).

## Testing

- `plan.ts`: pure fixture tests — version-range filtering, axis-matching (single axis, multiple axes, no axes required), sort order, empty-plan case.
- `state.ts`: real temp-git-repo tests (mirrors sub-project 1's `git-deps.ts` testing pattern) — a repo with no matching commit → `false`; a repo with a commit whose message is exactly `migrate: <id>` → `true`; a commit containing the id as a substring of an unrelated message → `false` (exact match, not substring, verifies the `^...$` anchoring).
- `run.ts`: mocked `CodemodDeps` — auto-chain through multiple consecutive `codemod` entries; stop at the first `ai-prompt` entry (returns `'paused'`, no further entries touched); skip entries `isApplied` already reports true for; dirty-tree throws before any entry is touched; empty plan returns `'up-to-date'` without calling `isTreeClean`; a codemod entry whose loaded function throws propagates the error without committing.
- One real end-to-end test: a fixture registry with one `codemod` entry followed by one `ai-prompt` entry, run against a real temporary git repo. First `runMigrate` call applies the codemod (real commit exists afterward), reaches the `ai-prompt` entry, returns `'paused'`. Test then makes the "user's" commit itself (`git commit -m "migrate: <the-ai-prompt-id>"`). Second `runMigrate` call (same plan, same repo) skips both now-applied entries and returns `'completed'`, with `blueprint.json.generatorVersion` bumped to the target.

## Documentation

This ships a new, user-facing CLI capability, not an internal-only mechanism like sub-project 1 — the implementation plan must include updating:
- `tools/create-icore/README.md` (the package's own README — it's in `package.json`'s published `files` list, so it's the doc real `npx create-icore` users actually see) — add a `## Migrating an existing project` section documenting the `migrate [--to <version>] [--continue]` subcommand: what it does, the `migrate: <id>` commit-message convention users must follow after applying an `ai-prompt` entry, and that it requires a clean git tree.
- `AGENTS.md` — the "Architecture" section already documents `tools/create-icore/` as the CLI source; add a short note that `create-icore` now has two modes (scaffold a new project vs. `migrate` an existing one) so future contributors don't miss the second entry point.

## Out of scope

- `--skip` flag (superseded by the manual-empty-commit convention above).
- `--undo` flag (each step is its own git commit; plain `git reset`/`git revert` suffice).
- Interactive REPL / dry-run / diff-preview UI (a plain non-interactive CLI, matching `nx migrate --run-migrations`, not the Nx Console UI).
- Authoring any real registry entries or codemods — this spec is pure mechanism, fixture-tested only, same discipline as sub-project 1.
- Fetching `registry.json` over the network — always the locally-installed copy (Decision Record).
