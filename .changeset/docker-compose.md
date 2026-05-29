---
'@idevconn/create-icore': minor
---

`docker compose up` local dev stack. Three new Dockerfiles (`Dockerfile.gateway`, `Dockerfile.ms-auth`, `Dockerfile.ms-upload`) using Node 24 alpine multi-stage builds with corepack + yarn 4 immutable installs. `docker-compose.yml` orchestrates the three services + a Redis broker (transport=redis); gateway publishes `3001:3001`, MSes stay internal. `.env.docker.example` documents the credentials block; `docs/runbooks/local-docker.md` walks through the boot sequence. CI gains a `docker-build` matrix job that builds all three Dockerfiles on every push via buildx with GitHub Actions cache.
