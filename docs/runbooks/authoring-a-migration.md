# Authoring a `create-icore migrate` migration

## Problem

`create-icore migrate` (the CLI subcommand that upgrades an already-scaffolded
project to a newer `@idevconn/create-icore`) reads a fully-built, tested
state machine — but as of 2026-08-25 `tools/create-icore/migrations/registry.json`
had **zero entries**. Every past shipped change (auth/storage/db strategies,
the payment feature, dependency bumps) went out with no migration path: an old
scaffolded project running `create-icore migrate` would report "Already up to
date" and silently do nothing, no matter how much drifted. The machinery
existed; nobody had ever fed it.

Registering the first real entry (`payment-never-crash-factory`, PR #258)
surfaced a second, sharper problem: `tools/create-icore/project.json`'s
`build` target `dependsOn`s `build-migration-registry`, which re-reads
`.changeset/*.migration.yml` on **every** `nx build create-icore`. Bake an
entry into `registry.json` and leave the `.migration.yml` sibling in place,
and the very next build — any PR touching `create-icore`, CI or local —
fails with `Duplicate migration id "..."`, because the script finds the same
pending pair again and the id is already in the registry it just loaded.

## Solution — the authoring sequence

1. Write `.changeset/<slug>.md` as usual (the version-bump note).
2. Write the paired `.changeset/<slug>.migration.yml`:
   ```yaml
   id: <matches the codemod filename>
   kind: codemod # or ai-prompt
   affectedAxes:
     - <axisName>:<unitId> # e.g. payment:paypal — matches blueprint.json fields
   affectedGlobs:
     - <path changed by the fix, relative to repo root>
   commitRange: <sha-before>..<sha-after> # verify with `git rev-parse`, never guess a hash
   description: >-
     What this migration does and why.
   ```
3. For `kind: codemod`, write `tools/create-icore/migrations/codemods/<id>.ts`,
   default-exporting `(projectDir: string) => void | Promise<void>`. See
   "Writing the codemod" below for the anchor-replace pattern.
4. Run `yarn nx run create-icore:build-migration-registry` **once** to bake
   the entry into `registry.json` (version-stamped from the current batch of
   pending changesets — same bump-selection rule `changeset version` uses).
5. **Delete the `.migration.yml`** — its job is done, the entry is now
   permanent in `registry.json`. Keep the `.changeset/<slug>.md`; `changeset
version` still needs it for the eventual version bump.
6. Rebuild (`yarn nx run create-icore:build`) to confirm it's idempotent —
   no `.migration.yml` left pending means no duplicate-id risk on any future
   build.
7. Test the codemod directly against fixture old/new file content (see
   `tools/create-icore/src/migrations/__tests__/payment-never-crash-factory.unit.test.ts`
   for the pattern), then smoke-test the full path: scaffold a fixture
   project with an old `generatorVersion` in `blueprint.json`, `git init` +
   commit it, run the **built** CLI (`node tools/create-icore/dist/cli.js
migrate` from inside it) — confirms the `dist/migrations/codemods/<id>.js`
   dynamic-import path (not exercised by unit tests importing the `.ts`
   source directly) and the `migrate: <id>` commit marker both work.

## Writing the codemod

Per the original design spec (`docs/superpowers/specs/2026-07-16-migrate-registry-design.md`):
anchor-based targeted replacement, never a full-file overwrite. A scaffolded
project is assumed customized — overwriting the whole file silently destroys
local edits, where an anchored patch can at least fail loud instead. Concretely:

- Assert the known pre-fix text is present verbatim (`content.includes(anchor)`)
  before touching anything.
- If any anchor is missing, `throw` with a specific message (already
  migrated, or customized past recognition) — `runMigrate` has no partial-
  success path for `kind: codemod`, so a thrown error is the only way to
  signal "couldn't do this safely," and it's still better than silently
  clobbering or silently doing nothing.
- `String.replace(oldAnchor, newAnchor)` per anchor; multiple small anchors
  beat one whole-file hash-gate (less likely to reject on unrelated drift
  elsewhere in the file).
