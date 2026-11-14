# create-icore `--ui=none` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `create-icore --ui=none` generates an API-only project: no `apps/client`, no client Docker/nginx artifacts, no client in `dev`/README/"Next" hints.

**Architecture:** Add `'none'` to `UiLibrary`. Reuse the additive blueprint engine: a `UI_NONE_EXCLUDED_PATHS` list in `manifest/resolve.ts` (same pattern as `UPLOAD_NONE_EXCLUDED_PATHS`) drops client paths before copy; `scaffold()` skips every client-only rewrite step when `ui === 'none'`. No post-copy regex stripping.

**Tech Stack:** TypeScript (tsup CLI), Vitest, Nx, Yarn 4.

**Spec:** Approved proposal in the 2026-11-13 conversation (branch `feature/create-icore-ui-none`); its content is condensed in "Global Constraints" below. Reference doc to update: `docs/runbooks/create-icore-blueprint-options.md`.

## Global Constraints

- Branch `feature/create-icore-ui-none` (already created from `dev`). **Never commit or push** (owner rule). Each task ends with "report files", not `git commit`. Final handoff = `git add` path list + Conventional Commit message ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `--gateway=none` is OUT of scope.
- `ui=none` + `host=cloudflare` is a validation **error** (Worker serves the built client through its `assets` binding).
- `ui` default stays `shadcn`; `none` is opt-in via `--ui=none`, config key `ui`, and a wizard entry.
- No dotfiles under `tools/create-icore/templates/`; do not hand-edit `templates/` (build artifact). Check `git status --short tools/create-icore/templates` is clean as the LAST step before reporting files.
- Prettier (`npx prettier --write <touched>`) → `yarn nx lint create-icore` → `yarn nx build create-icore` → docs, in that order, before reporting done.
- A `.changeset/<slug>.md` is required: frontmatter `"@idevconn/create-icore": minor`.
- Unit tests live next to code in `__tests__/`, named `*.unit.test.ts`. Run with `yarn nx test create-icore`.

## Review Focus

- `ui=none` + `auth=none`: `AUTH_NONE_EXCLUDED_PATHS` / `applyAuthNoneVariants(targetDir, ui)` must not touch missing `apps/client` files (no ENOENT crash).
- `ui=none` + `example=notes`: notes client route/nav must not be written; generation must still succeed and API notes still wired.
- `ui=none` + `host=cloudflare` → clear error naming `--ui=none`.
- Generated root `package.json` has no client-only deps (react, vite, tailwind, antd, mui…) and passes `audit` (no dangling `@icore/*` imports, e.g. `@icore/template-shared`).
- `blueprint.json` records `ui: "none"` and no `apps/client/blueprint.json` is written.

---

### Task 1: Accept `none` in types, config, validation

**Files:**

- Modify: `tools/create-icore/src/lib/options.ts` (`UiLibrary`, `validateOptions`)
- Modify: `tools/create-icore/src/lib/config.ts:54` (`UI_LIBRARIES`)
- Modify: `tools/create-icore/src/manifest/index.ts:232` (`ui` record)
- Test: `tools/create-icore/src/lib/__tests__/validate-options.unit.test.ts`, `tools/create-icore/src/lib/__tests__/config.unit.test.ts`

**Interfaces:**

- Produces: `UiLibrary = 'shadcn' | 'antd' | 'mui' | 'none'`; `MANIFEST.ui.none: Unit` (= `EMPTY`).

- [ ] **Step 1: Write failing tests**
  - validate-options: `validateOptions({...base, ui: 'none', host: 'cloudflare', authProvider: 'supabase', dbProvider: 'd1', upload: 'r2'}).errors` has an entry matching `/--ui=none/`; `validateOptions({...base, ui: 'none'}).errors` is `[]` and `.corrected.ui === 'none'`.
  - config: parsing `{ ui: 'none' }` yields `ui === 'none'`; `{ ui: 'bogus' }` still throws listing `shadcn, antd, mui, none`.
- [ ] **Step 2: Run** `yarn nx test create-icore -- validate-options config` → FAIL (type error / enum rejects `none`).
- [ ] **Step 3: Implement** the type change, add `'none'` to `UI_LIBRARIES`, add `none: EMPTY` to `MANIFEST.ui`, and in `validateOptions` push the cloudflare error: `--host=cloudflare does not support --ui=none (the Worker serves the built client) — see docs/runbooks/cloudflare-workers-host.md`. Fix any TS compile errors from the widened type with `yarn nx build create-icore` (expect `scaffold-pkg.ts:170` label map and `scaffold.ts` `client-${opts.ui}` usage; those are finished in Tasks 3-4 — a temporary `as` cast is NOT allowed, leave the build red until then or do Task 3/4 edits for those lines now).
- [ ] **Step 4: Run** the same tests → PASS.
- [ ] **Step 5:** Report touched files.

### Task 2: Exclude client artifacts from the copy

**Files:**

- Modify: `tools/create-icore/src/manifest/resolve.ts` (new `UI_NONE_EXCLUDED_PATHS`, applied in `resolveBindings`)
- Test: `tools/create-icore/src/manifest/__tests__/resolve.unit.test.ts`

**Interfaces:**

- Consumes: `addExcludedPath(p)` (already maps `apps/client/*` to `apps/templates/client-*/*`).
- Produces: `resolveBindings({...opts, ui: 'none'}).excludedPaths` contains `apps/client`, `apps/templates`, `Dockerfile.client`, `nginx.client.conf`, and `libs/template-shared` only if Step 3's check proves nothing outside the client imports it.

- [ ] **Step 1: Write failing tests** in resolve.unit.test.ts: with `ui:'none'`, `excludedPaths` has `apps/templates`, `apps/client`, `Dockerfile.client`, `nginx.client.conf`; with `ui:'shadcn'` it has none of them; `ui:'none'` + `auth:'none'` does not throw.
- [ ] **Step 2: Run** `yarn nx test create-icore -- resolve` → FAIL.
- [ ] **Step 3: Implement** `UI_NONE_EXCLUDED_PATHS` (exclude `apps/templates` directly, plus `apps/client`, `Dockerfile.client`, `nginx.client.conf`) and apply it like the upload list. Then run `grep -rn "template-shared" apps libs --include=*.ts --include=*.json -l | grep -v "apps/templates\|apps/client\|libs/template-shared"`; if empty, also exclude `libs/template-shared`; if not empty, leave it and note the consumers in the task report. Also grep the snapshot `docker-compose.yml`, `.github/workflows/*.yml`, e2e dirs (`apps/client-e2e` or similar), root `tsconfig.base.json` paths and `.env.docker.example` for client references and add any found to the list (or to a `rewriteCompose…`-style helper in `scaffold-strip.ts` if it is an in-file line, following `removeDockerComposeAuthService`).
- [ ] **Step 4: Run** resolve tests → PASS.
- [ ] **Step 5:** Report touched files.

### Task 3: Skip client rewrites in `scaffold()`; fix dev script, README, hints

**Files:**

- Modify: `tools/create-icore/src/lib/scaffold.ts` (guard `selectClientTemplate`, `writeClientEnv`, `writeNavConfig`, `applyAuthNoneVariants` calls on `opts.ui !== 'none'`)
- Modify: `tools/create-icore/src/lib/scaffold-pkg.ts` (`uiLabel` map ~l.170, README lines ~202-206, 246, 265, 284, 302; root `dev` script)
- Modify: `tools/create-icore/src/cli.ts:64` (`services` list, `open http://localhost:4200` line)
- Modify: `tools/create-icore/src/manifest/blueprint.ts:135` (skip `apps/client` blueprint when `ui==='none'`)
- Test: `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts` (follow its existing pattern for scaffolding into a tmp dir)

**Interfaces:**

- Consumes: `resolveBindings` excluded paths from Task 2.
- Produces: scaffolded project for `ui:'none'` where `apps/client` does not exist.

- [ ] **Step 1: Write failing integration tests** (tmp-dir scaffold, `install:false`, `initGit:false`): for each of `{ui:'none', auth:'supabase', example:'notes'}` and `{ui:'none', auth:'none', upload:'none'}`: `apps/client` and `Dockerfile.client` do not exist; `apps/api` exists; root `README.md` does not contain `localhost:4200` or `apps/client`; `blueprint.json` has `ui: 'none'`; `apps/client/blueprint.json` absent; scaffold resolves without throwing.
- [ ] **Step 2: Run** `yarn nx test create-icore -- scaffold.integration` → FAIL (ENOENT / `client-none` fallback to shadcn).
- [ ] **Step 3: Implement** the guards. Replace the silent shadcn fallback in `selectClientTemplate` with an early return for `none` (keep fallback only for the three real values). `rewriteRootPackageJson`: ensure the generated `dev` script runs only existing servable projects (check how `nx run-many -t serve` behaves with no client — it already runs whatever exists; just confirm). README sections: build the "Apps" tree and ports lines conditionally. `cli.ts`: drop `'client'` from `services` and skip the `open http://localhost:4200` line when `ui==='none'`.
- [ ] **Step 4: Run** integration tests → PASS; then `yarn nx test create-icore` (full) → PASS.
- [ ] **Step 5:** Report touched files.

### Task 4: Dependencies, audit and smoke coverage

**Files:**

- Modify: `tools/create-icore/src/lib/scaffold-pkg.ts` (or `scaffold-strip.ts`: new `pruneClientDeps(targetDir)`, mirroring `pruneApiExpressDep`/`pruneUnusedLibDeps`)
- Modify: `tools/create-icore/scripts/smoke-scaffold.mjs` (add combo `--ui=none`, and `--ui=none --auth=none --upload=none`)
- Test: `tools/create-icore/src/lib/__tests__/scaffold-strip.unit.test.ts`

**Interfaces:**

- Produces: `pruneClientDeps(targetDir: string): Promise<void>` — removes dependencies/devDependencies used only by the client from the generated root `package.json`.

- [ ] **Step 1: Determine the client-only dep set.** Compare `apps/templates/client-shadcn/package.json` (if any) and the imports of `apps/templates/client-*/src` against `apps/api`, `apps/microservices`, `libs`; the set is deps imported ONLY by client sources/config (react, react-dom, vite, @vitejs/_, tailwindcss, @tanstack/react-_, antd, @mui/*, i18next, etc.). Write the exact list as a constant in `scaffold-strip.ts` with a comment citing the method. If `pruneUnusedLibDeps` already prunes by actual imports, extend that instead of adding a second mechanism and say so in the report.
- [ ] **Step 2: Write failing test** in scaffold-strip.unit.test.ts: a fixture root `package.json` with `react`, `vite`, `@nestjs/core` → after `pruneClientDeps`, only `@nestjs/core` remains.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** and call it from `scaffold()` when `opts.ui === 'none'`. **Step 5: Run** unit tests → PASS.
- [ ] **Step 6: Verify end to end:** `node tools/create-icore/scripts/smoke-scaffold.mjs --help` to learn flags (never guess), then run the new combos in link mode. Expected: audit passes (no dangling `@icore/*` import, no unchosen provider SDK), `nx build` of `api` in the generated project is green.
- [ ] **Step 7:** Report touched files.

### Task 5: Wizard entry, docs, changeset, final checks

**Files:**

- Modify: `tools/create-icore/src/lib/prompts.ts:321-337` (add `{ value: 'none', label: 'No client (API only)' }`; widen the cast types to `UiLibrary`)
- Modify: `docs/runbooks/create-icore-blueprint-options.md` (options table `--ui` row → add `none`; validation table → cloudflare error; add an "`ui=none`" subsection describing excluded paths and interactions with `auth=none`/`example=notes`)
- Modify: `tools/create-icore/README.md` (flag docs)
- Create: `.changeset/create-icore-ui-none.md` — frontmatter `"@idevconn/create-icore": minor`, body one line: `Add --ui=none to generate an API-only project without the React client.`
- Test: `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`

- [ ] **Step 1: Write failing test:** `--ui=none` flag parsing yields `ui: 'none'` in the collected options (mirror an existing flag test in prompts.unit.test.ts); when `host=cloudflare`, the wizard must not offer `none` (assert the options passed to `p.select` if the existing tests mock it; otherwise assert only flag parsing).
- [ ] **Step 2: Run** `yarn nx test create-icore -- prompts` → FAIL. **Step 3: Implement. Step 4: Run** → PASS.
- [ ] **Step 5: Post-coding routine, in order:** `npx prettier --write <all touched files>`; `yarn nx lint create-icore` (0 errors); `yarn nx build create-icore` (green); `yarn nx test create-icore` (green); `node tools/create-icore/scripts/audit.mjs` only if its `--help` says it runs standalone; `git status --short tools/create-icore/templates` must be clean (discard drift if a build dirtied it).
- [ ] **Step 6:** Report the final `git add <paths>` list (from `git status --short`) and the commit message (`feat(create-icore): add --ui=none for API-only projects`, short body, attribution line).
