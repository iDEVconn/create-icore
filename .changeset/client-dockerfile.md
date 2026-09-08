---
"@idevconn/create-icore": patch
---

Added `Dockerfile.client` — a production Dockerfile for the React client, which previously had no Docker path at all (only the gateway and 4 microservices did). Multi-stage: `node:24-alpine` builder runs `vite:build` (the actual Nx target name for the client app — not `build`), then an `nginx:1.27-alpine` runtime serves the static output with SPA fallback (`nginx.client.conf`, `try_files ... /index.html`). VITE_-prefixed env vars are build-time only for a static SPA (no runtime `.env`), so they're accepted as build ARGs defaulting to `apps/client/.env.example`'s values. Wired into `snapshot-templates.mjs`'s `PATHS_TO_COPY` so generated projects receive both files. P1 item #8 from the third-party iCore infrastructure audit.

Verified end-to-end (not just typechecked): scaffolded a real project, ran `docker build -f Dockerfile.client`, started the resulting container, and confirmed both `/` and an arbitrary deep route return the SPA shell (200), proving the nginx fallback works — this path had never been exercised by any existing test or CI job (`client` isn't in the `scaffold-smoke` matrix's `--projects` list).
