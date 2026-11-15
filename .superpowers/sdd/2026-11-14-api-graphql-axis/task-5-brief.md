### Task 5: Client neutral refactor, `queries/profile.ts` (all three templates)

**Files:** Create `apps/templates/client-{shadcn,antd,mui}/src/queries/profile.ts`; modify each `src/routes/_dashboard/profile.tsx` (the inline `api(...)` calls at the lines found by `grep -n "api" <file>`); Test: `src/queries/__tests__/profile.unit.test.ts` per template, existing profile route tests unchanged.

**Interfaces:** Produces `useProfile(): UseQueryResult<Profile>` and the mutation hooks the page currently needs, same signatures in all three templates, using `api` from `../main`; `export interface Profile { uid: string; email: string; role: string }`.

- [ ] **Step 1: Read** each `profile.tsx` and list its `api` calls; write failing hook tests (mock `../main` `api`, assert the REST paths and request shapes it currently uses).
- [ ] **Step 2: Run** `yarn nx test client-shadcn -- profile` (and antd, mui) -> FAIL.
- [ ] **Step 3: Implement** the hooks (behaviour copied from the page) and make the three pages use them; identical hook file across templates.
- [ ] **Step 4: Run** `yarn nx run-many -t lint test build -p client-shadcn client-antd client-mui` -> PASS.
- [ ] **Step 5: Commit** `refactor(client): move profile requests into queries/profile.ts`.

