### Task 5: Docs + changeset

**Files:**

- Create: `.changeset/postgres-auth-strategy.md`
- Modify: `AGENTS.md` — update PostgreSQL provider section

**Interfaces:**

- Produces: changeset for release pipeline; updated AGENTS.md docs

- [ ] **Step 1: Create changeset**

Create `.changeset/postgres-auth-strategy.md`:

```markdown
---
'@idevconn/create-icore': minor
---

Add PostgreSQL auth strategy (@icore/auth-postgres): bcrypt + JWT, users and sessions stored in auto-created \_icore_users / \_icore_sessions tables, selectable via --auth=postgres
```

- [ ] **Step 2: Update `AGENTS.md` PostgreSQL section**

Find the existing `### PostgreSQL (db only)` section and replace it with:

```markdown
### PostgreSQL (db + auth)

**Env vars (db strategy):**
```

DB_PROVIDER=postgres
POSTGRES_URL=postgresql://user:pass@host:5432/dbname

```

**Env vars (auth strategy):**

```

AUTH_PROVIDER=postgres
POSTGRES_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-secret
JWT_EXPIRES_IN=15m # optional, default 15m
JWT_REFRESH_EXPIRES_IN=7d # optional, default 7d

````

**Setup:**

1. Any PostgreSQL >= 14 instance works: Docker (`docker-compose up postgres`), Neon, Railway, AWS RDS, self-hosted.
2. No schema setup required — tables auto-created on first write per collection (db) or first auth call (auth).
3. Auth tables: `_icore_users`, `_icore_sessions` (prefixed to avoid conflict with your schema).
4. `last_logged_in` column on `_icore_users` updated on every `signIn` and `refresh`.

**Schema (db):** Each collection maps to one table: `id TEXT PRIMARY KEY, data JSONB NOT NULL`.

**Schema (auth):**
```sql
_icore_users  (id, email, password_hash, role, last_logged_in, created_at)
_icore_sessions (id, user_id, refresh_token, expires_at)
````

**Note:** `POSTGRES_URL` must include credentials. For SSL, append `?sslmode=require` to the URL. Both `--auth=postgres` and `--db=postgres` use the same `POSTGRES_URL` — single instance covers both.

````

- [ ] **Step 3: Prettier**

```bash
npx prettier --write .changeset/postgres-auth-strategy.md AGENTS.md
````

- [ ] **Step 4: Commit**

```bash
git add .changeset/postgres-auth-strategy.md AGENTS.md
git commit -m "docs: add postgres auth strategy changeset and AGENTS.md docs"
```

- [ ] **Step 5: Push + open PR to dev**

```bash
git push -u origin feature/postgres-auth-strategy
gh pr create --base dev \
  --title "feat(auth-postgres): add standalone PostgreSQL auth strategy" \
  --body "$(cat <<'EOF'
## Summary

- New lib \`@icore/auth-postgres\` — bcrypt + JWT, users/sessions in \`_icore_users\` / \`_icore_sessions\` tables (auto-created)
- \`create-icore\` CLI: \`--auth=postgres\` option wired into manifest, prompts, blueprint
- \`last_logged_in\` tracked per user on every signIn/refresh
- CI: \`postgres-auth\` scaffold smoke combo added
- Single Postgres instance covers both \`--auth=postgres --db=postgres\`

## Test plan

- [ ] \`nx test auth-postgres\` — all contract + module tests pass
- [ ] \`nx build auth-postgres\` — green
- [ ] \`nx lint auth-postgres\` — 0 errors
- [ ] \`nx test create-icore\` — all tests pass
- [ ] CI scaffold smoke \`postgres-auth\` green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
