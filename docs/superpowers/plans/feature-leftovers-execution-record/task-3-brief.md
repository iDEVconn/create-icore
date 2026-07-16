## Task 3: Postgres branch missing in scaffold `.env` generation

`tools/create-icore/src/lib/scaffold-env.ts` has an explicit `mongodb` branch in `writeAuthEnv` (appends `MONGODB_URI` + `JWT_SECRET`) and in `writeRootEnv` (appends `MONGODB_URI` when `dbProvider=mongodb`), but no equivalent `postgres` branch — even though `postgres` is a first-class `AuthBackend`/`DbProvider` value (`options.ts:1,3`). Per `AGENTS.md`'s own PostgreSQL section, a postgres project needs `POSTGRES_URL` + `JWT_SECRET` in the auth MS `.env`, and `POSTGRES_URL` in the root `.env`. Right now choosing `--auth=postgres --db=postgres` silently produces a `.env` missing both.

**Files:**
- Modify: `tools/create-icore/src/lib/scaffold-env.ts` — `writeAuthEnv` (~line 213-225), `writeRootEnv` (~line 274-286)
- Modify: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` — add postgres cases next to the existing mongodb ones (~line 1091, ~line 128)
- Modify: `apps/microservices/auth/.env.example` — document the postgres credential block (parity with the existing Supabase/Firebase sections)

**Interfaces:** No signature changes — `writeAuthEnv(targetDir: string, opts: CreateIcoreOptions)` and `writeRootEnv(targetDir: string, opts: CreateIcoreOptions)` keep their existing shape.

- [ ] **Step 1: Write the failing tests** — add to `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` right after the existing `'does not append MONGODB_URI when authProvider is not mongodb'` test (~line 1103, inside `describe('writeAuthEnv — broker transport env', ...)`'s sibling block, i.e. add a new adjacent `it` inside the `describe('writeAuthEnv', ...)` block that starts at line 75, or add a new describe—match the existing style by appending to the same describe block used for the mongodb case):

```ts
  it('appends POSTGRES_URL and JWT_SECRET when authProvider=postgres', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, authProvider: 'postgres' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('POSTGRES_URL=postgresql://user:pass@localhost:5432/icore');
    expect(env).toContain('JWT_SECRET=change-me-in-production');
  });

  it('does not append POSTGRES_URL when authProvider is not postgres', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, authProvider: 'supabase' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).not.toContain('POSTGRES_URL');
  });
```

And inside `describe('writeRootEnv', ...)` (~line 128), add:

```ts
  it('appends POSTGRES_URL to .env when dbProvider=postgres', async () => {
    await writeRootEnv(dir, { ...baseOpts, targetDir: dir, dbProvider: 'postgres' });
    const env = await readFile(join(dir, '.env'), 'utf8');
    expect(env).toContain('DB_PROVIDER=postgres');
    expect(env).toContain('POSTGRES_URL=postgresql://user:pass@localhost:5432/icore');
  });
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
yarn nx test create-icore -t "postgres"
```
Expected: FAIL — the 2 new positive-assertion tests fail because `scaffold-env.ts` has no postgres branch yet (the negative test, "does not append", already passes trivially).

- [ ] **Step 3: Add the postgres branch to `writeAuthEnv`** in `tools/create-icore/src/lib/scaffold-env.ts` (~line 220):

```ts
  if (opts.authProvider === 'mongodb') {
    next +=
      '\nMONGODB_URI=mongodb://localhost:27017/icore-auth\nJWT_SECRET=change-me-in-production\n';
  }
  if (opts.authProvider === 'postgres') {
    next +=
      '\nPOSTGRES_URL=postgresql://user:pass@localhost:5432/icore\nJWT_SECRET=change-me-in-production\n';
  }
```

- [ ] **Step 4: Add the postgres branch to `writeRootEnv`** (~line 281):

```ts
  if (opts.dbProvider === 'mongodb') {
    lines.push(`MONGODB_URI=mongodb://localhost:27017/icore-data`);
    lines.push(``);
  }
  if (opts.dbProvider === 'postgres') {
    lines.push(`POSTGRES_URL=postgresql://user:pass@localhost:5432/icore`);
    lines.push(``);
  }
```

- [ ] **Step 5: Run tests again, confirm pass**

```bash
yarn nx test create-icore -t "postgres"
```
Expected: PASS, all 3 new tests green.

- [ ] **Step 6: Document postgres in the auth `.env.example`** — add a new section to `apps/microservices/auth/.env.example` mirroring the existing Supabase/Firebase blocks (insert after the Firebase OAuth block, before EOF):

```
# --- PostgreSQL credentials (when AUTH_PROVIDER=postgres) ---
POSTGRES_URL=postgresql://user:pass@localhost:5432/icore
JWT_SECRET=change-me-in-production
# JWT_EXPIRES_IN=15m          # optional, default 15m
# JWT_REFRESH_EXPIRES_IN=7d   # optional, default 7d
```

- [ ] **Step 7: Full test + lint pass**

```bash
npx prettier --write tools/create-icore/src/lib/scaffold-env.ts tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts apps/microservices/auth/.env.example
yarn nx lint create-icore
yarn nx test create-icore
yarn nx build create-icore
```
Expected: all green.

- [ ] **Step 8: Commit**
```bash
git add tools/create-icore/src/lib/scaffold-env.ts tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts apps/microservices/auth/.env.example
git commit -m "fix(scaffold): generate POSTGRES_URL/JWT_SECRET when auth/db provider=postgres"
```

---

