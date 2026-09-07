---
"@idevconn/create-icore": patch
---

Generated projects now ship a `.github/workflows/ci.yml`. Previously `tools/create-icore`'s `snapshot-templates.mjs` never copied `.github` from the root repo (which wouldn't have made sense anyway — this repo's own `pipeline.yml` publishes the `create-icore` package itself and runs scaffold smoke tests against every provider combo, none of which applies to a generated project), so every scaffolded project came out with zero CI/CD. Added a thin, package-manager-agnostic Nx-affected pipeline (`tools/create-icore/_template-shell/.github/workflows/ci.yml`, wired in via `SHELL_OVERRIDES`) that runs `nx affected -t lint test build` on every PR and on push to `main`/`dev` — no deploy step, that's left to the product. P1 item #7 from the third-party iCore infrastructure audit.
