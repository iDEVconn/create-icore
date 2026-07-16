# Task 6: AGENTS.md docs + changeset + PR — DONE

## Status: DONE

All steps completed. Documentation added, changeset created, all tests passing, PR opened to `dev`.

## Files Changed

- **AGENTS.md** — Added PostgreSQL setup section after MongoDB section (lines 176-186)
  - Env vars documented: `DB_PROVIDER=postgres`, `POSTGRES_URL`
  - Setup instructions: requirements, auto-creation, schema, SSL notes
  
- **.changeset/postgres-db-strategy.md** — New changeset file
  - Type: `minor` (new feature)
  - Message: "Add PostgreSQL direct DB strategy (`--db=postgres`) using postgres.js with JSONB document storage and auto-created GIN indexes."

- **docs/superpowers/plans/2026-06-29-postgres-db-strategy.md** — Task plan artifact (committed)

- **docs/superpowers/specs/2026-06-29-postgres-db-strategy-design.md** — Design spec artifact (committed)

## Test Results

```
✓ db-postgres lint: 0 errors
✓ db-postgres test: 14/14 tests passing (12 contract + 2 module)
✓ db-postgres build: clean build
✓ create-icore test: 158/158 tests passing (includes new manifest test)
✓ create-icore build: clean build
✓ create-icore lint: 0 errors
```

## Commit & PR

- **Commit SHA:** `e2882fb`
- **Commit message:** `docs: add PostgreSQL db strategy setup docs and changeset`
- **PR URL:** https://github.com/iDEVconn/create-icore/pull/216
- **PR base:** `dev`
- **PR title:** `feat(db-postgres): add PostgreSQL direct DB strategy via postgres.js`

## Next Steps (User Action)

1. Wait for CI to complete on PR #216
2. Review the changes
3. Merge the PR manually when ready (user performs the merge, not automated)

All pre-merge checks are green.

---

# Task 6 Addendum: PostgreSQL DB Strategy Bug Fixes — DONE

## Status: DONE

Four bugs fixed in `PostgresDBStrategy`. Changes applied to both the lib and its blueprint copy, with test fixture updated.

## Fixes Applied

### Fix 1 — ensureTable retry-safe (Important)
- **Problem:** If `_createTable` rejected, the rejected promise remained in `this.initializing`; subsequent calls hit `if (inflight) return inflight` and re-awaited the dead promise — no recovery without restart.
- **Fix:** Added `.catch()` to clear the map entry on rejection before re-throwing. Retries now get a fresh attempt.
- **Files:** Both `postgres-db.strategy.ts` copies.

### Fix 2 — Atomic update() via JSONB || operator (Important)
- **Problem:** GET + UPDATE had a TOCTOU race — concurrent writers could clobber each other's patches.
- **Fix:** Single-roundtrip `UPDATE … SET data = data || $patch RETURNING id`. PostgreSQL JSONB `||` is a shallow merge equivalent to `{...existing, ...patch}`, but atomic.
- **Files:** Both `postgres-db.strategy.ts` copies.

### Fix 3 — Atomic delete() via RETURNING (Minor)
- **Problem:** Redundant GET + DELETE pattern — two round-trips, same race window as update().
- **Fix:** `DELETE … RETURNING id`, check `rows.count === 0` for not-found.
- **Files:** Both `postgres-db.strategy.ts` copies.

### Fix 4 — wire-db.unit.test.ts fixture missing deps (Minor)
- **Problem:** Fixture `apps/microservices/notes/package.json` was missing `@icore/db-mongodb` and `@icore/db-postgres`; the `cleanupUnusedDb` test couldn't assert postgres cleanup.
- **Fix:** Added both deps to fixture; added `expect(pkg.dependencies).not.toHaveProperty('@icore/db-postgres')` assertion in `cleanupUnusedDb` describe block.
- **File:** `tools/create-icore/src/manifest/__tests__/wire-db.unit.test.ts`

## Test Results

```
✓ db-postgres test:    14/14 tests passing
✓ create-icore test:  158/158 tests passing
✓ db-postgres lint:    0 errors
✓ prettier:            all files formatted correctly
```

## Commit & Push

- **Commit SHA:** `1a3c8bc`
- **Commit message:** `fix(db-postgres): atomic update/delete, ensureTable retry-safe, fixture deps`
- **Branch:** `feature/postgres-db-strategy` (pushed to remote)
