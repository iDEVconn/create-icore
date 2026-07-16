### Task 8: Documentation

**Files:**

- Modify: `tools/create-icore/README.md`
- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: nothing (documents Task 7's shipped behavior).
- Produces: nothing consumed by other tasks — this is the terminal task.

- [ ] **Step 1: Add a "Migrating an existing project" section to `tools/create-icore/README.md`**

Insert the following new section immediately before the existing `## Contributing` heading:

```markdown
## Migrating an existing project

Projects scaffolded by an older `create-icore` version can absorb generator/template fixes shipped since, without regenerating from scratch:

\`\`\`bash
cd my-existing-project
npx create-icore migrate --to latest # or --to 0.15.0 for a specific version
\`\`\`

`migrate` requires a clean git working tree and walks any pending migrations relevant to your project's chosen providers/UI (read from your generated `blueprint.json`) one at a time:

- Mechanical fixes are applied and committed automatically (commit message `migrate: <id>`).
- Fixes that need judgment print a description and the real diff from how `create-icore`'s own template changed, then pause — apply the equivalent change yourself (with your own coding assistant, adapting to any customization you've made), commit your work with a message containing exactly `migrate: <id>`, then re-run the same `migrate` command to continue. Re-running is always safe — already-applied migrations are detected from your git history and skipped.

There is no separate resume flag needed (`--continue` is accepted for familiarity but does nothing extra); running the exact same command again always picks up where you left off.
```

- [ ] **Step 2: Add a note to `AGENTS.md`'s Architecture section**

In `AGENTS.md`, find this line in the `tools/` tree diagram (Architecture section):

```
└── create-icore/         # npx CLI source
```

Change it to:

```
└── create-icore/         # npx CLI source (scaffold new projects; `create-icore migrate` upgrades existing ones)
```

- [ ] **Step 3: Prettier + commit**

```bash
npx prettier --write tools/create-icore/README.md AGENTS.md
git add tools/create-icore/README.md AGENTS.md
git commit -m "docs(create-icore): document the migrate subcommand"
```

---

## Self-Review Notes

- **Spec coverage:** Command entry/flags → Task 7. `plan.ts` → Task 1. `state.ts`'s corrected exact-match design → Task 2. `run.ts` orchestration → Task 3. Real `CodemodDeps` → Task 4. Codemod convention/shipping → Task 6. Error handling (dirty tree, codemod throw, up-to-date, missing registry) → covered across Tasks 3, 4, 7's tests and the real smoke test. Testing section's real end-to-end pause/resume case → Task 5. Documentation section → Task 8. Out-of-scope items (`--skip`, `--undo`, REPL/dry-run, real registry entries) are not implemented anywhere in this plan.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `CodemodDeps` is defined once in Task 3 (`run.ts`) and implemented by Task 4's `createMigrateDeps` without redefinition. `RegistryEntry`/`RegistryFile` are imported from sub-project 1's `build-registry.ts` everywhere, never redefined. `MigrateResult`'s three literal values (`'completed' | 'paused' | 'up-to-date'`) are used identically in Task 3's implementation, Task 3's tests, and Task 7's CLI branch.
- **Cross-cutting correctness catch:** `semver`'s dependency classification is intentionally NOT changed until Task 7 — it stays a devDependency (harmlessly) through Tasks 1-6 since nothing yet makes it reachable from a real `tsup` entry; Task 7 is precisely where `migrate-cli.ts` gets imported by `cli.ts`, which is where the reclassification becomes load-bearing. Flagging this explicitly so no task before Task 7 "fixes" it prematurely or, worse, a reviewer flags it as missing in an earlier task where it isn't yet relevant.
