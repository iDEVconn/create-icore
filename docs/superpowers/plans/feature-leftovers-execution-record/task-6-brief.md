### Task 6: AGENTS.md docs + changeset + PR

**Files:**
- Modify: `AGENTS.md`
- Create: `.changeset/postgres-db-strategy.md`

**Interfaces:**
- Produces: Docs, changeset, PR on `dev`

- [ ] **Step 1: Add PostgreSQL setup section to `AGENTS.md`**

Find the `### MongoDB (auth + storage + db)` section. Add a new section after it:

```markdown
### PostgreSQL (db only)

**Env vars:**

```
DB_PROVIDER=postgres
POSTGRES_URL=postgresql://user:pass@host:5432/dbname
```

**Setup:**

1. Any PostgreSQL >= 14 instance works: Docker, Neon, Railway, AWS RDS, self-hosted.
2. No schema setup required — tables auto-created on first write per collection.
3. GIN index on `data` JSONB column created automatically per collection.

**Schema:** Each collection maps to one table: `id TEXT PRIMARY KEY, data JSONB NOT NULL`.

**Note:** `POSTGRES_URL` must include credentials. For SSL, append `?sslmode=require` to the URL.
```

- [ ] **Step 2: Create changeset**

Create `.changeset/postgres-db-strategy.md`:

```markdown
---
"@idevconn/create-icore": minor
---

Add PostgreSQL direct DB strategy (`--db=postgres`) using postgres.js with JSONB document storage and auto-created GIN indexes.
```

Use `minor` (new feature, not a fix).

- [ ] **Step 3: Final full test run**

```bash
yarn nx run-many -t lint test build --projects=db-postgres,create-icore
```

Expected: All green.

- [ ] **Step 4: Prettier all touched files**

```bash
npx prettier --write AGENTS.md
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md .changeset/postgres-db-strategy.md
git commit -m "docs: add PostgreSQL db strategy setup docs and changeset"
```

- [ ] **Step 6: Check PR state before pushing**

```bash
gh pr list --state all --limit 10
```

Confirm no existing PR for this branch.

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin feature/postgres-db-strategy
gh pr create --base dev \
  --title "feat(db-postgres): add PostgreSQL direct DB strategy via postgres.js" \
  --body "$(cat <<'EOF'
## Summary

- New `@icore/db-postgres` lib with `PostgresDBStrategy` using `postgres.js`
- JSONB schema (`id TEXT PRIMARY KEY, data JSONB NOT NULL`) + GIN index auto-created per collection
- `FakeDBStrategy` fallback in dev when `POSTGRES_URL` missing
- Full `runDBContract` test coverage via in-memory mock
- Blueprint copied to `tools/create-icore/templates/libs/db-strategies/postgres/`
- CLI: new `--db=postgres` option in `create-icore` (options, manifest, prompts)
- AGENTS.md setup docs + `minor` changeset

## Test plan

- [ ] `yarn nx test db-postgres` — all contract + module tests pass
- [ ] `yarn nx build db-postgres` — clean build
- [ ] `yarn nx lint db-postgres` — 0 errors
- [ ] `yarn nx test create-icore` — all existing tests pass + new manifest test

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Report PR URL and CI status**

```bash
gh pr view --web 2>/dev/null || gh pr list --head feature/postgres-db-strategy
```

Wait for CI green before reporting done.
