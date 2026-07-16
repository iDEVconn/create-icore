### Task 5 Report: Docs + changeset (final task)

**Status:** COMPLETE

**Commits:** `3289ca0`

**Summary:**

Created changeset file and updated AGENTS.md documentation to cover the new PostgreSQL auth strategy.

**Changes made:**

1. **Created `.changeset/postgres-auth-strategy.md`**
   - Declares `@idevconn/create-icore` minor version bump
   - Documents: bcrypt + JWT auth, users/sessions in auto-created `_icore_users` / `_icore_sessions` tables
   - Selectable via `--auth=postgres` CLI flag

2. **Updated `AGENTS.md` — PostgreSQL section**
   - Renamed `### PostgreSQL (db only)` to `### PostgreSQL (db + auth)`
   - Added separate "Env vars (db strategy)" and "Env vars (auth strategy)" sections
   - Added JWT options: `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` (optional, with defaults)
   - Added auth table prefixing and `last_logged_in` tracking details
   - Included full SQL schema for `_icore_users` and `_icore_sessions`
   - Clarified both auth and db use the same `POSTGRES_URL` instance

**Prettier:** All files formatted correctly
**No build/lint needed:** These are docs + config files only

**Concerns:** None.
