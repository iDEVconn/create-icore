---
'@idevconn/create-icore': patch
---

Ship yarn 4.5.0 runtime + new Dockerfiles + payment/notes/jobs microservices in the CLI template snapshot. v0.2.0 missed:

- `.yarn/releases/yarn-4.5.0.cjs` → scaffolded projects failed `yarn install` with `ENOENT: .yarn/releases/yarn-4.5.0.cjs`.
- `apps/microservices/{payment,notes,jobs}` directories.
- `Dockerfile.{gateway,ms-auth,ms-upload,ms-jobs}`, `docker-compose.yml`, `.env.docker.example`, `.dockerignore`.

README now lists yarn / pnpm / bunx invocations alongside the npm one.
