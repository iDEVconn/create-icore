---
"@idevconn/create-icore": patch
---

Aligned `.nvmrc` and `.github/actions/setup/action.yml`'s `setup-node` step to Node 24, matching all 5 Dockerfiles (`Dockerfile.gateway`, `.ms-auth`, `.ms-jobs`, `.ms-payment`, `.ms-upload`) and the release workflow, which already ran Node 24 — previously `.nvmrc` (22) and the PR pipeline's setup action (22) were out of step with what Docker/release actually run, an untested version skew between local dev and the shipped runtime. P1 item #6 from the third-party iCore infrastructure audit.

Note: `Dockerfile.ms-payment` is not currently copied into generated projects by `tools/create-icore/scripts/snapshot-templates.mjs`'s `PATHS_TO_COPY` list (unlike the other 4 Dockerfiles) — a separate pre-existing scaffold gap, out of scope for this patch.
