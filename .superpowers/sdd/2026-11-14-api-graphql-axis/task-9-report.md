# Task 9 report: live verification (steps 0-3)

Status: DONE_WITH_CONCERNS. Every step passed. Step 2 found one real defect, fixed test-first and re-verified live. The concerns are observations only.

Commits (branch `feature/api-graphql`, not pushed):
- `9c9bf6f` fix(api): resolve note delete and file remove on an empty reply
- `7002333` docs: the all-none notice also requires --api=rest

Tests after the fix:
- create-icore 53 files / 678 tests pass.
- `yarn nx run-many -t lint test build -p notes-client,upload-client,api,create-icore,notes,upload`: 31/31 succeeded.
- create-icore tsc: 10 lib / 15 spec (unchanged).

No credentials were used: the services run their in-memory dev fakes (no provider env).

## Step 0: docs
`docs/runbooks/create-icore-blueprint-options.md` changes:
- `--api` row: "the all-`none` notice needs `api=rest`".
- Warning list: the notice condition now includes `api=rest`, with a sentence on why graphql/both shows no notice.

## Step 1: generated projects boot (install mode): PASS x4
Setup: `yarn nx build create-icore` and `snapshot-templates`, with `TMPDIR` in the scratchpad.

Command: `smoke-scaffold.mjs --auth=supabase --db=supabase --upload=supabase --example=notes --session=memory --mode=install --run --run-seconds=90 --services=api,auth,upload,notes` plus the flags below. Each run is a real `yarn install`, `nx build` (12 tasks), `nx lint` (6 tasks) and a 90 s boot.

| flags | result |
|---|---|
| `--api=graphql --ui=shadcn` | `✓ smoke OK (... api=graphql ... mode=install run=true)` |
| `--api=graphql --ui=antd` | `✓ smoke OK` |
| `--api=graphql --ui=mui` | `✓ smoke OK` |
| `--api=both --ui=shadcn` | `✓ smoke OK` (`services stayed up 90s, no crash`) |

The driving shell loop exited 1, but only because of an empty-glob cleanup line after each run; every smoke itself printed `smoke OK`.

## Step 2: real round trip: PASS (one defect found and fixed)
**Project.** `--api=graphql --ui=none --session=memory`, supabase providers without credentials, so every microservice ran with its in-memory fake.
- Steps: generated from `dist`, real `yarn install`, `nx run-many -t build -p api,auth,upload,notes` (11 tasks).
- Run: `node dist/...` for auth/upload/notes (`ADMINS_LIST=admin@test.dev` on auth) and the gateway on :3001.
- Script: `scratchpad/live/roundtrip.sh`, using curl with cookie jars and `X-CSRF-Token` from the `icore_csrf` cookie.
- Outputs (trimmed) are below. Full transcripts: `scratchpad/live/rt-dev.txt` and `rt-prod.txt`.

**REST login.**
- register 201 and login 201 for both users.
- Each cookie jar holds `icore_sid` and `icore_csrf`.

**Profile:**
- `{ me }` as user: `200 {"data":{"me":{"uid":"d938…","email":"user@test.dev","role":"user"}}}`
- `{ me }` as admin: `200 {"data":{"me":{"email":"admin@test.dev","role":"admin"}}}`

**Notes:**
- `createNote` (user): `200 {"data":{"createNote":{"id":"d872…","title":"from user","ownerId":"d938…"}}}`; the admin also created one.
- **Admin/user parity:**
  - `notes` as user: `total 1` (own only).
  - `notes` as admin: `total 2` (all).
  - user deletes the admin's note: `403 … "code":"FORBIDDEN"`.
  - admin deletes the user's note: `200 {"data":{"deleteNote":true}}` (after the fix).
  - admin reads the deleted note: `404 NOT_FOUND`.

**Mixed documents:**
- `{ me notes }` as user: `200` with only the user's own notes.
- `{ health me }` without a session: `401`, `data = None`, codes `['UNAUTHENTICATED']`. Nothing partial leaks.
- `{ health }` without a session or CSRF token: `200 {"data":{"health":{"status":"ok"}}}`.

**Rejections:**
- No CSRF header (a query): `403 {"errors":[{"message":"csrf_mismatch",…,"extensions":{"code":"FORBIDDEN"}}],"data":null}`
- Session cookie dropped: `401 {… "message":"missing_session" … "UNAUTHENTICATED"}],"data":null}`
- Mutation via GET, no preflight header: `400` (Apollo CSRF prevention).
- Mutation via GET with `apollo-require-preflight`: `405 "GET requests only support query operations, not mutation operations"`.
- Batched array body: `400 "Operation batching disabled." BAD_REQUEST`
- 1000-alias query: `400 "1000 aliases exceed the maximum of 15." GRAPHQL_VALIDATION_FAILED`

**`NODE_ENV=production` gateway** (with `SESSION_STORE_ALLOW_MEMORY=true`; same checks):
- `{ __schema }`: `400 "GraphQL introspection is not allowed … INTROSPECTION_DISABLED"`. Development returned `200` with the schema.
- No error carries a `stacktrace` (development errors did).
- GraphiQL: `GET /api/graphql` with `Accept: text/html` returns `400`, no GraphiQL page.

**Defect found (pre-existing in the clients since base, now hit by the GraphQL mutations):**
- **Symptom:** admin `deleteNote` returned `200 {"errors":[{"message":"no elements in sequence",…"INTERNAL_SERVER_ERROR"}]}` although the note was deleted (the next `notes` call no longer showed it).
- **Cause:** the `notes.delete` and `storage.remove` handlers return nothing, so the transport completes the reply without a value and `firstValueFrom()` throws `EmptyError`. The same applies to `removeFile` and to the REST deletes.
- **Fix:** `firstValueFrom(…, { defaultValue: undefined })` in `libs/notes-client` and `libs/upload-client`.
- **Tests:** unit tests with an `EMPTY` reply. RED: `promise rejected "EmptyErrorImpl" … no elements in sequence`; GREEN after the fix.
- **Related changes in the same commit:**
  - upload-client's dependency checks now ignore test files, like notes-client.
  - The rest golden test lists the two new test files; they ship in every mode with their feature.
- **Re-verified live** after rebuilding the generated gateway with the patched clients: `{"data":{"deleteNote":true}}`.

## Step 3: browser (Playwright MCP): PASS
- **Setup:** a generated `--api=graphql --ui=antd` project (installed); its client ran with `vite --port 4201`, whose dev proxy points at the Step 2 gateway (development mode). The client's `queries/notes.ts` is the GraphQL implementation.
- **Login:** logged in as `user@test.dev` through the UI form, which redirected to `/dashboard`.
- **Notes page:** list, then New note ("Browser note"), Save, the row appears, Delete and confirm, the "Note deleted" notification shows and the page says "No notes yet." Network: every notes call is `POST /api/graphql` with 200.
- **Session expiry:** I restarted the gateway, which drops the in-memory sessions.
  - **GraphQL:** clicking Profile sent `POST /api/graphql` → `401`, then the client tried `POST /api/auth/refresh` → `404`, then redirected to `/login`.
  - **REST comparison:** after logging in again and dropping the session again, an authenticated REST call through the same client (`api('/auth/session')`) gave `GET /api/auth/session` → `401`, then `POST /api/auth/refresh` → `404`, then a redirect to `/login`, with the error status 401.
  - **Result:** the sequence is identical on both transports; GraphQL errors go through the same `@idevconn/api-client`.
- **Console:** only template warnings unrelated to the axis (antd `message` deprecation, zustand persisted-state migration notice) plus the expected 401/404 resource errors.
- **Cleanup:** the browser is closed and all PIDs I started (3 microservices, gateway, vite) are killed; ports 3001, 4001, 4002, 4004 and 4201 are free.

## Concerns / observations
1. On a 401, `@idevconn/api-client` calls `POST /api/auth/refresh`, which the BFF gateway does not have, so it gets a 404 before redirecting to `/login`. Behaviour is the same for REST and GraphQL and the end state is correct (refresh happens server-side in the BFF), but it is one wasted request per expiry. This is pre-existing; the fix candidate is the api-client config, owner's call.
2. Step 1's install-mode boot check only shows the services stay up; Step 2 covers the real `/api/graphql` traffic.
3. Pre-existing items already reported (auth.callback orphan, shadcn/mui tsc errors, `rest` + auth=none rate limit) are unchanged.
