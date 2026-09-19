### Task 8b: `iCore` — bump `@idevconn/api-client` pin in `_template-shell`

Per user decision (2026-09-19): fold the scaffold-generator's stale pin bump into this PR rather than a separate follow-up.

**Files:**

- Modify: `tools/create-icore/_template-shell/package.json`

**Do NOT touch:** `tools/create-icore/templates/**` — generated build artifact, regenerates from `_template-shell` on the next `nx build create-icore` (or equivalent generator build step); hand-editing it directly is discarded on the next build and drifts from source.

- [ ] **Step 1: Confirm current pin and target version**

```bash
grep '"@idevconn/api-client"' tools/create-icore/_template-shell/package.json package.json
```

Expected: `_template-shell` shows an older range (`^0.3.0` or `^0.3.2` per this plan's Global Constraints note); root shows `^0.3.3`. If `_template-shell` is already `^0.3.3` or newer, this task is a no-op — ledger it as such and skip to Task 9.

- [ ] **Step 2: Bump the pin**

Edit `tools/create-icore/_template-shell/package.json`'s `@idevconn/api-client` entry to match root's `^0.3.3` (or whatever newer version root currently pins, if it has moved since this plan was written — root is the source of truth, not the literal string `^0.3.3`).

- [ ] **Step 3: Rebuild the generated `templates/` artifact**

Run whatever this repo's existing generator-build step is (check `tools/create-icore/package.json`'s `scripts` for a `build`/`generate-templates` task, or `yarn nx build create-icore` if that's how it's wired) so `templates/**`'s copy of `package.json` picks up the bumped pin automatically. Do not hand-edit `templates/**` directly.

- [ ] **Step 4: Verify no other drift**

```bash
grep -rn '"@idevconn/api-client"' tools/create-icore/templates/**/package.json
```

Confirm every generated template now shows the bumped version, not a stale one.

- [ ] **Step 5: Format, lint, build**

```bash
npx prettier --write tools/create-icore/_template-shell/package.json
yarn nx lint create-icore
yarn nx build create-icore
```

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/_template-shell/package.json tools/create-icore/templates
git commit -m "chore(create-icore): bump scaffolded @idevconn/api-client pin to match root"
```

---
