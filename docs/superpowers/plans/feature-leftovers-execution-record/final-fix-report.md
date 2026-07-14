# Final whole-branch review — fix pass report

Branch: `feature/leftovers`
Commit created: `3840e61` — "chore: add changeset for scaffold fixes, confirm postgres env dedup"

## Finding 1 (Critical): No changeset — FIXED

Created `.changeset/scaffold-generator-gaps.md` with the exact frontmatter/body specified
in the task brief (`"@idevconn/create-icore": patch`, prettier normalized the quotes to
single quotes on write, no content change). Summarizes: nx 23.0.1 bump, webpack-cli 7
`--node-env` fix across auth/notes/payment/jobs/upload, postgres `POSTGRES_URL`/`JWT_SECRET`
generation, and shadcn `components.json` + dialog/dropdown-menu wiring.

## Finding 2 (Important): Postgres .env duplication — VERIFIED FIXED, NO FURTHER ACTION NEEDED

Read `apps/microservices/auth/.env.example` (already modified, unstaged, by the controller
before I started). Confirmed:
- No static `POSTGRES_URL=` or `JWT_SECRET=` lines remain in the file.
- The file ends with a one-line comment pointing at `writeAuthEnv()` in `scaffold-env.ts`.
- `tools/create-icore/src/lib/scaffold-env.ts` `writeAuthEnv()` (lines 224-227) appends
  `POSTGRES_URL` + `JWT_SECRET` only when `opts.authProvider === 'postgres'`, mirroring the
  existing `mongodb` branch (lines 220-223) exactly.

No duplication exists anywhere else. I did not need to make any code change for this
finding — just confirmed the controller's edit is correct and staged it as part of my commit
(it was sitting unstaged in the working tree).

## Finding 3 (Important): Test fidelity gap — VERIFIED, NO TEST CHANGES NEEDED

Inspected the `beforeEach` fixture in
`tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` (lines 42-73): the synthetic
`.env.example` written for `apps/microservices/auth/.env.example` in tests never included a
postgres block to begin with (it only has AUTH_TRANSPORT/HOST/PORT/PROVIDER and a commented
redis line). The postgres tests (lines 1112-1123: "appends POSTGRES_URL and JWT_SECRET when
authProvider=postgres" / "does not append POSTGRES_URL when authProvider is not postgres")
exercise `writeAuthEnv()`'s append logic against that fixture and were never coupled to the
real file's now-removed static block. No test assertions needed changes.

Also checked `scaffold.integration.unit.test.ts` — no postgres references there, so it isn't
affected either.

## Test / Lint / Build results

- `yarn nx test create-icore -t postgres` — ran (hit Nx cache showing prior green run), 171/171
  tests passed across all 15 test files.
- `yarn nx test create-icore --skip-nx-cache` (full suite, forced fresh run, no cache) — **171
  passed (171), 15 test files passed (15)**. All green, ~1.4s.
- `yarn nx lint create-icore` — **0 errors** ("All files pass linting", cache hit).
- `yarn nx build create-icore` — **green**. tsup built ESM/CJS/DTS bundles successfully.

### Build side-effect discovered and reverted (not part of assigned findings)

Running `yarn nx build create-icore` regenerates the checked-in
`tools/create-icore/templates/` snapshot via `snapshot-templates.mjs` (a `dependsOn` build
step). This produced 3 unrelated working-tree diffs:

- `templates/apps/microservices/auth/.env.example` — synced to match the (correct) real file.
- `templates/libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.module.unit.test.ts`
  — synced to match the real (already-committed) test file.
- `templates/.husky/pre-commit` — **this one is a real, pre-existing latent bug**: the
  template's committed content intentionally uses `npx lint-staged` / `npx nx affected`
  (added in commit `d37b52b`, "husky uses npx for PM-agnostic hooks", so scaffolded projects
  work regardless of package manager). But `snapshot-templates.mjs`'s `PATHS_TO_COPY` list
  includes `.husky/pre-commit` unconditionally and copies the *root repo's own* hook (which
  correctly uses `yarn` for this monorepo) over the template, silently reverting the npx fix
  every time `create-icore` is built. `SHELL_OVERRIDES` only protects `package.json` from this
  clobbering, not `.husky/pre-commit`.

  This is out of scope for the 3 assigned findings and touching it wasn't authorized, so I
  reverted all 3 template diffs with `git checkout --` before committing, per the instruction
  to touch only the changeset + the auth `.env.example`. **Flagging this for a follow-up
  ticket** — it's a genuine bug that will keep resurfacing on every future `create-icore`
  build/release until `snapshot-templates.mjs` either drops `.husky/pre-commit` from
  `PATHS_TO_COPY` or adds it to `SHELL_OVERRIDES` with a template-specific source file.

## Files changed (committed)

- `.changeset/scaffold-generator-gaps.md` (new)
- `apps/microservices/auth/.env.example` (staged the controller's pre-existing unstaged edit)

No other files were modified or committed. The untracked
`docs/superpowers/plans/2026-07-05-scaffold-generator-gaps.md` was left untouched as instructed.

## Concerns

1. The `.husky/pre-commit` template-regeneration bug described above is real but out of scope
   — recommend a follow-up fix to `snapshot-templates.mjs`.
2. Prettier reformatted the changeset frontmatter quote style (double → single quotes) on
   write; this is cosmetic and consistent with the rest of the repo's prettier config, no
   content change.
