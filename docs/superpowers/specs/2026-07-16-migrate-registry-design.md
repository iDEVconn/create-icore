# create-icore Migration Registry + Build Step — Design

## Context

Projects scaffolded by `create-icore` accumulate drift from the generator over time: fixes and improvements land in `tools/create-icore` (this session alone shipped 11+ generator gap-closing PRs) but a project scaffolded before those PRs has no way to absorb them short of manual diffing. This spec is sub-project 1 of a 2-part plan for a future `create-icore migrate [--to <version>]` command:

1. **Registry + build-step** (this spec) — the data pipeline: how migration-worthy changes get authored and turned into a versioned, shippable registry. No CLI, no execution logic.
2. **`migrate` CLI** (separate spec, follow-up) — consumes the registry produced here to actually walk a scaffolded project through pending migrations.

This spec covers only #1. It intentionally ships zero real registry entries — pure plumbing, validated via synthetic fixtures. Backfilling real entries (e.g. the MUI 9.2 icon rename from PR #248) is separate future work, not in scope here.

### Reference architecture (researched via `nx_docs`)

Nx's `nx migrate` uses a `migrations.json` that maps target package versions to versioned migration generators, applied sequentially with per-step human accept/undo and a required clean git tree. This design borrows that shape (version-keyed entries, git-checkpointed, human-gated execution — deferred to sub-project 2) but diverges on _how entries get content_: instead of hand-written codemods for every change, entries are typed `codemod | ai-prompt`, and content is derived from real commit diffs rather than hand-authored per entry (see Decision Record below).

### Decision record (L99 deep-analysis, approved)

Three options were compared: (A) pure static-codemod registry — Nx-identical, rejected because semantic fixes (e.g. re-minting a JWT after a role change) don't reduce to an AST transform, and blind codemods risk corrupting hand-edited files silently. (B) pure AI-prompt registry — every entry becomes a prompt consumed by the user's own coding agent; correct on drift-tolerance but wastes an LLM turn on purely mechanical changes a regex would handle for free. (C) **hybrid, chosen** — each entry is tagged `codemod` (context-free textual substitution, safe regardless of surrounding code — icon renames, dep bumps) or `ai-prompt` (anything where correctness depends on surrounding logic — reserved for genuine judgment calls). Both tiers are pre-filtered by the target project's recorded axis choices before either runs.

A second decision, made while designing this spec: registry content is **not hand-written** per entry. Every entry's diff is derived at build time from the real commit range that made the change, via `git diff <commitRange> -- <affectedGlobs>` against `create-icore`'s own repo — the same "generate from real source, never hand-maintain" principle already established by `tools/create-icore/scripts/snapshot-templates.mjs`. This keeps authoring cost near zero (the PR that makes the change already produces the commit range) and guarantees the registry can never drift from what actually shipped.

## Design

### 1. `blueprint.json`: `generatorVersion` field

`writeBlueprintJson` (`tools/create-icore/src/manifest/blueprint.ts`) gains a `generatorVersion` field recording the `create-icore` package semver at scaffold time. This is the anchor sub-project 2's CLI will use to know "what version is this project currently at." Projects generated before this field existed simply lack it — treated as version `0` by any future consumer, meaning "every migration applies."

### 2. Migration metadata: sibling file, not changeset frontmatter

**Correction from initial draft:** `@changesets/parse` (verified by reading `node_modules/@changesets/parse`) treats every top-level frontmatter key as `{name: <key>, type: <value>}` and throws unless `type` is a string (`major`/`minor`/`patch`/`none`). Nesting a `migration:` object inside a changeset's YAML frontmatter — as first drafted — crashes `changeset version` the moment such a changeset exists. Migration metadata must never enter the changeset's own frontmatter block.

Instead: an **optional sibling file**, same basename as the changeset, `.migration.yml` extension: a changeset at `.changeset/mui-9-2-icon-rename.md` pairs with `.changeset/mui-9-2-icon-rename.migration.yml`. The changeset itself (frontmatter + summary) is completely unaffected by this spec and stays exactly as `AGENTS.md` already mandates — this file is additive, read only by our own build script, invisible to `changesets` tooling.

```yaml
# .changeset/mui-9-2-icon-rename.migration.yml
id: mui-9-2-icon-rename
kind: codemod # or: ai-prompt
affectedAxes:
  - 'ui:mui'
affectedGlobs:
  - 'apps/templates/client-mui/src/**/*.tsx'
commitRange: '336161f..a1b2c3d'
description: 'Rename 3 icon imports for MUI v9 (un-suffixed Outline aliases removed).'
```

`description` is duplicated here (rather than reused from the changeset body) because the changeset summary is prose aimed at a changelog reader, while this field is the text the future CLI will show a user mid-migration — the two audiences don't always want the same wording, and decoupling them avoids the build script needing to scrape and reformat changeset markdown.

Field semantics:

- `id` — unique slug across the whole registry (build fails on collision).
- `kind` — `codemod` or `ai-prompt`. Determines whether a matching file must exist under `tools/create-icore/migrations/codemods/`.
- `affectedAxes` — list of `"<axisName>:<unitId>"` strings matching manifest `Unit` identity (e.g. `"authProvider:postgres"`, `"ui:mui"`). A future CLI consumer will only surface an entry when ALL listed axes match the target project's `blueprint.json` selections.
- `affectedGlobs` — glob patterns (relative to repo root) the build step uses to scope the diff. Prevents unrelated file noise (lockfiles, docs, plan files) from polluting the baked diff.
- `commitRange` — `<baseSha7>..<headSha7>` covering the commits that made this change. This is exactly what the subagent-driven-development progress ledger already records per task (`Task N: complete (commits <base7>..<head7>, review clean)`) — authoring this field costs nothing beyond copying a value that already exists by PR time. Verified safe: `dev` merges are non-squash (preserves feature-branch commits: e.g. `b0ee749 Merge pull request #232 from iDEVconn/feature/leftovers`), so a range recorded before merge stays resolvable in `dev` history indefinitely.

`migration` is optional — changesets without it behave exactly as they do today (version bump + changelog only, no registry entry).

### 3. Codemod convention

`kind: codemod` entries must have a matching `tools/create-icore/migrations/codemods/<id>.ts`, exporting a single function:

```typescript
export default function migrate(projectDir: string): void | Promise<void>;
```

Codemods must be narrow and anchor-based (e.g. "replace this exact import specifier if present," not "rewrite this whole file") — this is a drift-safety requirement, not a style preference: a scaffolded project is assumed customized, and a whole-file overwrite silently destroys user edits where an anchored patch degrades safely to a no-op-with-warning.

`kind: ai-prompt` entries have no codemod file. Their registry payload (baked `description` + `diff`) is the entire content; sub-project 2's CLI will hand this to the user to run through their own coding agent.

### 4. Build script

`tools/create-icore/scripts/build-migration-registry.ts` (run via `tsx`), invoked at `nx build create-icore` (same trigger as `snapshot-templates.mjs`, before it runs `changeset version` which would otherwise delete the changeset files this script reads):

1. Glob all `.changeset/*.migration.yml` sibling files (each paired 1:1 with a `.changeset/<same-basename>.md`). Runs strictly _before_ `changeset version` (which bumps `package.json` and deletes consumed `.md` changeset files in one step) — deleting the `.md` file does not delete its `.migration.yml` sibling (changesets tooling has no awareness of it), but the script still runs first for simplicity and to keep both files' lifecycle visually paired during development.
2. For each: validate its paired `.md` changeset exists (a `.migration.yml` with no matching changeset is an authoring error); validate `id` uniqueness across the whole batch plus the existing `registry.json`; resolve `commitRange` via `git diff <commitRange> -- <affectedGlobs>` in the repo; if `kind: codemod`, verify `codemods/<id>.ts` exists.
3. Compute the release version this batch bumps `@idevconn/create-icore` to _without_ invoking `changeset version` yet: read the current `package.json` version, take the highest bump level (`major` > `minor` > `patch`) across **all** pending changesets in `.changeset/*.md` (not just the ones with a paired `.migration.yml`), apply standard semver bump. This mirrors `changeset version`'s own bump-selection rule, so the two stay in agreement.
4. Merge new entries into `tools/create-icore/migrations/registry.json` (append, keyed by `id`, stamped with the version computed in step 3), sorted by version ascending.
5. Only after this script completes does the release pipeline run `changeset version` (bumping `package.json` to the same version and deleting the now-consumed changeset files).

`registry.json` is a committed, versioned artifact — NOT gitignored (unlike `templates/`), since it must accumulate across releases rather than being regenerated from current-HEAD state each time.

### Error handling (all release-blocking — the build step fails the `create-icore` build, not silently skips)

- `commitRange` sha unresolvable in git history → build fails, names the bad entry.
- `affectedGlobs` matches zero changed files within `commitRange` → build fails (signals a wrong glob or wrong range, not a legitimately-empty diff — an entry with nothing to show is a mistake, not a valid state).
- Duplicate `id` (within the batch, or colliding with an existing `registry.json` entry) → build fails.
- `kind: codemod` with no matching file under `codemods/` → build fails.
- `.migration.yml` with no paired `.changeset/<same-basename>.md` → build fails (orphaned metadata, almost certainly a rename/typo).

## Testing

Unit tests for `build-migration-registry.ts` against fixture `.changeset/*.md` + `.migration.yml` pairs + a fixture git repo (or mocked `git diff` invocations):

- Valid `.migration.yml` paired with its changeset → correct entry shape appended to `registry.json`, correctly version-stamped.
- `affectedGlobs` correctly scopes the diff (a change outside the glob list does not appear in the baked diff).
- Unresolvable `commitRange` → build fails with a clear error naming the entry `id`.
- Zero-file-match on `affectedGlobs` → build fails.
- Duplicate `id` (within batch, and against pre-existing `registry.json`) → build fails.
- `kind: codemod` missing its `codemods/<id>.ts` → build fails.
- `.migration.yml` with no paired changeset → build fails.
- Changeset with no paired `.migration.yml` → unaffected, no registry entry produced (existing changeset behavior preserved).
- Regression guard: a changeset frontmatter is parsed with the real `@changesets/parse` (or an equivalent same-shape fixture) to confirm the build step never writes anything back into `.changeset/*.md` frontmatter — the whole point of the sibling-file design.

Unit test for `writeBlueprintJson`: emitted `blueprint.json` includes `generatorVersion` matching the running package version.

## Out of scope

- The `migrate` CLI itself (execution loop, state file, codemod auto-apply, ai-prompt stop/resume) — sub-project 2, separate spec.
- Backfilling real registry entries for past PRs (MUI 9.2, revoke(), HMAC, etc.) — explicitly deferred, not required to validate this pipeline.
- Any change to the existing changeset-gate enforcement (`AGENTS.md` mandate stays as-is; the `.migration.yml` sibling file is additive/optional on top of it, and never touches changeset frontmatter).
