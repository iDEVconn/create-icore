### Task 1: D1 lib scaffold + REST client

**Files:**

- Create (via generator): `libs/db-strategies/d1/` (project `db-d1`, alias `@icore/db-d1`)
- Create: `libs/db-strategies/d1/src/lib/d1-client.ts`
- Create: `libs/db-strategies/d1/src/index.ts`
- Test: `libs/db-strategies/d1/src/lib/__tests__/d1-rest-client.unit.test.ts`
- Modify: root `package.json` (none expected), `tsconfig.base.json` (alias added by generator)

**Interfaces:**

- Produces (all exported from `d1-client.ts`):
  - `type D1Param = string | number | null`
  - `interface D1QueryResult<T> { rows: T[]; changes: number }`
  - `interface D1ClientLike { query<T = Record<string, unknown>>(sql: string, params?: D1Param[]): Promise<D1QueryResult<T>> }`
  - `class D1ApiError extends Error { status: number; codes: number[] }`
  - `interface D1RestClientOptions { accountId: string; databaseId: string; apiToken: string; fetch?: typeof fetch; timeoutMs?: number; maxRetries?: number; sleep?: (ms: number) => Promise<void> }`
  - `function createD1RestClient(opts: D1RestClientOptions): D1ClientLike`

- [ ] **Step 1: Generate the lib.** Run `yarn nx g @nx/js:lib --help`, then generate `d1` under `libs/db-strategies` with importPath `@icore/db-d1`, tsc build, Vitest. Align `package.json`, `vitest.config.mts`, `project.json`, tsconfigs to `libs/db-strategies/sqlite` (name `@icore/db-d1`, Vitest `name: 'db-d1'`, cacheDir/coverage paths for `d1`). Verify: `yarn nx show project db-d1` lists `build`, `lint`, `test`.
- [ ] **Step 2: Write failing tests** in `d1-rest-client.unit.test.ts` with an injected fake `fetch`: `posts sql and params to the account/database query URL with a Bearer token`; `returns rows and changes from result[0].results and result[0].meta.changes`; `throws D1ApiError with status and Cloudflare error codes on success:false`; `does not retry a 401/403/400`; `retries 429 then succeeds, honouring Retry-After (sleep called with 1000 for Retry-After: 1)`; `gives up after maxRetries and throws D1ApiError`; `retries a pre-response network error then succeeds`; `aborts and throws when the request exceeds timeoutMs`.
- [ ] **Step 3: Run** `yarn nx test db-d1` — expect FAIL (module missing).
- [ ] **Step 4: Implement** `createD1RestClient` and `D1ApiError` in `d1-client.ts` per the Interfaces and Global Constraints (URL `https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{databaseId}/query`, body `{ sql, params }`, `AbortSignal.timeout(timeoutMs)` default 10000, `maxRetries` default 2, default `sleep` via `setTimeout`). Export from `src/index.ts`.
- [ ] **Step 5: Run** `yarn nx test db-d1` — expect PASS.
- [ ] **Step 6: Commit** `feat(db-d1): D1 REST client` (lib scaffold + client + tests + `tsconfig.base.json` + `yarn.lock` if changed).

