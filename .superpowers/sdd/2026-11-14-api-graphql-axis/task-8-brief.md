### Task 8: CI, smoke combos, docs, changeset

**Files:** Modify `.github/workflows/pipeline.yml` (combos `api-graphql-shadcn`, `api-graphql-antd`, `api-graphql-mui`, `api-both`, `api-graphql-minimal` in shard 2; new steps in the `check` job: `yarn nx run api:graphql-schema && git diff --exit-code apps/api/schema.gql` and `yarn nx run client-shadcn:graphql-codegen && git diff --exit-code apps/templates/client-shadcn/src/gql`), `.github/workflows/scaffold-smoke-matrix.yml` (legs `supabase-graphql-tcp-antd`, `supabase-both-tcp-shadcn`), `AGENTS.md` (axis, always-REST list, `/api/graphql`, guard rule, schema/codegen checks), `docs/runbooks/create-icore-blueprint-options.md` (option row, validation rules, exclusion summary), `tools/create-icore/README.md` (`--api` row); Create `docs/runbooks/graphql-api.md` (how it works, security requirements, how to add a resolver, error mapping), `.changeset/api-graphql-axis.md` (minor).

- [ ] **Step 1: Edit** the files above; `npx prettier --write` all touched files.
- [ ] **Step 2: Verify** locally: `yarn nx run-many -t lint test build` (all projects) and both drift commands exit 0.
- [ ] **Step 3: Commit** `docs(ci): wire the api axis into smoke combos, drift checks and runbooks`.

