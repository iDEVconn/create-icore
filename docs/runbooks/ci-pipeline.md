# CI pipeline (`.github/workflows/pipeline.yml`)

Goal: do as little work per push/PR as possible. Measured on PR runs (2026-09-21): `setup` (install) cost ~35s in every job while the real work was 9–22s, so the pipeline was dominated by repeated installs — a dev→main PR ran ~46 Build legs + 6 Docker builds (~85 billable min, 26 min wall); a tiny PR ran 14 jobs (~15 billable min).

## Shape

| Job               | Runs when                                           | Notes                                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detect-affected` | always                                              | `nx show projects --affected` (full list on `workflow_dispatch`); also computes `docker-images`                                                                                                                                                                                                                              |
| `check`           | something affected                                  | ONE job: lint → test → format (changed files only) → route-integrity. Steps use `!cancelled()` so one push reports every failure. Redis service container is for libs/shared's `RedisSessionStore` contract test                                                                                                             |
| `build`           | something affected                                  | ONE job: `nx affected -t build --parallel` (Nx builds each shared lib once). Runs alongside `check`, not after it                                                                                                                                                                                                            |
| `scaffold-smoke`  | something affected                                  | 2 shards × 4 combos (was 8 jobs); combos are looped in one step, failures are collected and named                                                                                                                                                                                                                            |
| `docker-build`    | push to `main` / PR into `main` only, after `check` | Only images whose project is affected (`api→gateway`, `auth→ms-auth`, `upload→ms-upload`, `jobs→ms-jobs`, `payment→ms-payment`, `ai-orchestrator→ms-ai`). On PRs additionally only if a Docker input changed (`Dockerfile.*`, `.dockerignore`, `docker-compose*`, root `package.json`, `yarn.lock`, `.yarnrc.yml`, `.nvmrc`) |

`.github/actions/setup` takes `nx-cache: 'true'` to also cache `.nx/cache` (key per job + lockfile + sha, with restore-keys fallbacks).

## Things to know

- Check names changed (`Check (lint)` etc. → `Check (lint, test, format)`, `Build <project>` → `Build (affected)`, `Scaffold smoke (<combo>)` → `Scaffold smoke (shard N)`). No branch protection / rulesets exist today; if you add required checks, use the new names.
- New projects need no CI edit (affected-based). A new Dockerfile needs a line in the `mapping` dict in `detect-affected` and in the `docker-build` image list it produces.
- The old per-project `dist-*` artifact upload on `main` was dropped — nothing downloaded it.
- `client` has no plain `build` target (it uses `vite:build`), so — as before — CI's Build job does not build it.
- All workflows pin `ubuntu-24.04`.

## Not done (candidates, measure first)

- Dockerfiles `COPY . .` before `yarn install`, so the gha layer cache never hits the install layer (~250s per image). Copying manifests first (all workspace `package.json` + `yarn.lock`) would fix it.
- `setup` still costs ~35s per job (node_modules in the actions/cache is large); try caching only `.yarn/cache` and compare.
- `scaffold-smoke-matrix.yml` (nightly, 15 jobs) failed on 7 of the last 11 nightly runs (2026-09-22 → 2026-10-02) — investigate separately.
