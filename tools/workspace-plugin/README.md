# @icore/workspace-plugin

Workspace Nx Devkit generators for the iCore monorepo.

## Available Generators

### `microservice`

Scaffolds a new NestJS microservice under `apps/microservices/<name>`, creates its `@icore/<name>-client` library under `libs/<name>-client`, and wires it into the API gateway (`apps/api`).

```bash
# Preview changes (dry-run)
yarn nx g @icore/workspace-plugin:microservice billing --dry-run --no-interactive

# Generate and wire microservice
yarn nx g @icore/workspace-plugin:microservice billing --no-interactive

# With DBStrategy and Dockerfile
yarn nx g @icore/workspace-plugin:microservice billing --withDb --withDocker --no-interactive
```

👉 **[Read the full Microservice Extension & Consumption Guide](../../docs/articles/microservice-plugin.md)** for architecture deep dive, step-by-step RPC tutorials, DBStrategy wiring, and pub/sub events.

### `python-service`

Scaffolds a new Python microservice under `apps/microservices/<name>` (FastAPI or gRPC, packaged with `uv`), registers it in the root `uv` workspace (`pyproject.toml`), creates its `@icore/<name>-client` library under `libs/<name>-client`, and wires it into the API gateway (`apps/api`).

```bash
# Preview changes (dry-run)
yarn nx g @icore/workspace-plugin:python-service ml-inference --dry-run --no-interactive

# Generate FastAPI microservice (default)
yarn nx g @icore/workspace-plugin:python-service ml-inference --no-interactive

# Generate gRPC microservice with .proto contract
yarn nx g @icore/workspace-plugin:python-service embeddings --framework=grpc --no-interactive

# Generate isolated microservice without adding to root uv workspace
yarn nx g @icore/workspace-plugin:python-service ml-inference --uvWorkspace=false --no-interactive
```
