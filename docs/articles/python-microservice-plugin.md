# Python Microservice Extension & Plugin Guide (`@icore/workspace-plugin`)

The `@icore/workspace-plugin:python-service` generator automates creating and wiring a new Python microservice (using **FastAPI** or **gRPC**, packaged with **`uv`**) into the iCore monorepo. It integrates the service into the root `uv` workspace, scaffolds a typed `@icore/<name>-client` library for your NestJS applications, and safely wires everything into the API gateway (`apps/api`) via TypeScript AST transformations.

> [!TIP]
> Looking for NestJS microservices? See the [NestJS Microservice Plugin Guide](./microservice-plugin.md).

---

## Architecture Overview

In iCore, client applications (React SPA / mobile) communicate exclusively with the NestJS API Gateway (BFF). For Python microservices, the API Gateway delegates incoming requests to the Python service using **HTTP REST (FastAPI)** or **gRPC** via the generated `@icore/<name>-client` library.

```text
Browser / Frontend
       │
       ▼ (HTTP: POST /api/ml-inference/predict)
[API Gateway] apps/api/src/app/ml-inference/ml-inference.controller.ts
       │
       ▼ (calls this.mlInference.predict())
[Client Lib] libs/ml-inference-client/src/lib/ml-inference-client.service.ts
       │
       ▼ (HTTP REST via Axios or gRPC via ClientGrpc)
[Python Service] apps/microservices/ml-inference/src/main.py
       │
       ▼ (FastAPI / gRPC handlers & ML/data logic)
[Python Logic / Models] (Uvicorn / grpc.aio server)
```

### Python Tooling: `uv` Workspaces

All Python services are managed using [Astral `uv`](https://github.com/astral-sh/uv) for fast package resolution and zero-friction workspace integration:

- **Shared `uv` Workspace:** By default, new Python services are automatically registered in the monorepo root `pyproject.toml` under `[tool.uv.workspace] members = ["apps/microservices/<name>"]`.
- **Fast, Deduplicated Installs:** All services share a single `.venv` and `uv.lock` at the root, reducing disk usage and build times.
- **IDE Support:** Point your Python interpreter (VS Code / PyCharm / Cursor) to `<workspaceRoot>/.venv` once, and linting, formatting, and autocomplete work seamlessly across all Python services.

---

## Prerequisites

Ensure `uv` is installed on your machine:

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# macOS via Homebrew
brew install uv

# Windows via PowerShell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Verify your installation:

```bash
uv --version
```

---

## Generator Command & CLI Flags

Run the generator using the Nx CLI:

```bash
# Preview changes in dry-run mode
yarn nx g @icore/workspace-plugin:python-service ml-inference --dry-run --no-interactive

# Scaffold a FastAPI microservice (default) with automated gateway wiring
yarn nx g @icore/workspace-plugin:python-service ml-inference --no-interactive

# Scaffold a gRPC microservice with a .proto contract
yarn nx g @icore/workspace-plugin:python-service embeddings --framework=grpc --no-interactive

# Scaffold on a custom port with custom Nx boundary tags
yarn nx g @icore/workspace-plugin:python-service search --port=4010 --tags=tier:ai,team:data --no-interactive

# Scaffold an isolated microservice (without root pyproject.toml)
yarn nx g @icore/workspace-plugin:python-service scraper --uvWorkspace=false --no-interactive

# Scaffold an internal background worker (skips gateway & client library)
yarn nx g @icore/workspace-plugin:python-service async-worker --skipBff --no-interactive
```

### Argument & Flag Reference

| Flag                | Type      | Default              | Description                                                                                                                                                                                            |
| :------------------ | :-------- | :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name` _(required)_ | `string`  | _(1st argument)_     | Name of the microservice in kebab-case (e.g. `ml-inference`, `embeddings`, `search-engine`). Automatically normalized to `snake_case` for Python module paths and `PascalCase` for TypeScript classes. |
| `--framework`       | `enum`    | `fastapi`            | Python framework: `fastapi` (HTTP REST + OpenAPI + Axios client) or `grpc` (Protobuf + `grpc.aio` + NestJS `ClientGrpc`).                                                                              |
| `--port`            | `number`  | _(auto-incremented)_ | Port for the microservice. If omitted, scans existing microservices in `apps/api/.env.example` and picks the next available port (`4006`, `4007`, etc.).                                               |
| `--uvWorkspace`     | `boolean` | `true`               | Registers `apps/microservices/<name>` into the monorepo root `pyproject.toml` `[tool.uv.workspace] members`. Set to `false` for standalone services.                                                   |
| `--skipBff`         | `boolean` | `false`              | Skips generating `libs/<name>-client` and gateway wiring in `apps/api`. Use for standalone internal workers.                                                                                           |
| `--tags`            | `string`  | `""`                 | Comma-separated extra tags to append to `project.json` (defaults to `["type:microservice", "lang:python", "scope:<name>"]`).                                                                           |

---

## What Gets Generated & Wired

When you run `yarn nx g @icore/workspace-plugin:python-service <name>`:

### 1. Python Microservice (`apps/microservices/<name>/`)

- **`pyproject.toml`**: Configured with pinned dependencies (`fastapi`, `uvicorn`, `pydantic` or `grpcio`, `protobuf`), plus developer tooling:
  - `ruff` (linter and code formatter)
  - `mypy` (strict type checking)
  - `pytest` & `pytest-asyncio` (async unit testing)
- **`src/main.py`**:
  - **FastAPI mode:** Instantiates `app = FastAPI()` with a `GET /health` endpoint returning `{ "status": "ok", "service": "<name>", "timestamp": "..." }` and a sample `POST /v1/echo` route.
  - **gRPC mode:** Defines an async `grpc.aio` server implementing `Ping` RPC from the `.proto` contract.
- **`tests/test_main.py`**: Async test suite ready to run via `pytest`.
- **`Dockerfile`**: Production-ready multi-stage build using `ghcr.io/astral-sh/uv:python3.12-bookworm-slim`.
- **`project.json`**: Standard Nx run-commands targets (`serve`, `lint`, `format`, `test`, `typecheck`, and `proto` for gRPC).
- **`.env.example` & `.env`**: Pre-configured with host, port, and transport settings.

### 2. Client Library (`libs/<name>-client/` → `@icore/<name>-client`)

- **`<name>-client.tokens.ts`**: Dependency injection tokens (`<CONSTANT_NAME>_HTTP_OPTIONS` or `<CONSTANT_NAME>_CLIENT`).
- **`<name>-client.service.ts`**:
  - **FastAPI mode:** Type-safe Axios client with `ping(): Promise<<Name>PingResponse>` and a generic `request()` method.
  - **gRPC mode:** NestJS `ClientGrpc` wrapper exposing `ping(): Promise<<Name>PingResponse>`.
- **`<name>-client.module.ts`**: Exports `<Name>ClientModule.forRoot()` reading `<CONSTANT_NAME>_URL` from the environment.
- **`tsconfig.json` & `project.json`**: Pre-configured buildable TypeScript library aliased in `tsconfig.base.json`.

### 3. API Gateway Feature Module (`apps/api/src/app/<name>/`)

- **`<name>.module.ts`**: Imports `<Name>ClientModule.forRoot()` and registers the controller.
- **`<name>.controller.ts`**: Exposes `@Get('health')` (`GET /api/<name>/health`) with Swagger documentation (`@ApiTags`, `@ApiBearerAuth`).

### 4. Automatic AST Modifications & Root Workspace Registration

The generator automatically:

- Registers `apps/microservices/<name>` in root `pyproject.toml` `[tool.uv.workspace] members`.
- AST-injects `<Name>Module` into `@Module({ imports: [...] })` in [`apps/api/src/app/features.module.ts`](file:///Volumes/Project/idevconn/create-icore/apps/api/src/app/features.module.ts).
- Registers `{ name: '<name>', prefix: '<PREFIX>' }` in [`apps/api/src/app/gateway-services.ts`](file:///Volumes/Project/idevconn/create-icore/apps/api/src/app/gateway-services.ts).
- Adds path mapping `"@icore/<name>-client"` into [`tsconfig.base.json`](file:///Volumes/Project/idevconn/create-icore/tsconfig.base.json).
- Adds `"@icore/<name>-client": "*"` dependency into [`apps/api/package.json`](file:///Volumes/Project/idevconn/create-icore/apps/api/package.json).
- Appends `<PREFIX>_TRANSPORT`, `<PREFIX>_HOST`, `<PREFIX>_PORT`, and `<PREFIX>_URL` to [`apps/api/.env.example`](file:///Volumes/Project/idevconn/create-icore/apps/api/.env.example) and `apps/api/.env`.

---

## Developer Workflow & Nx Tasks

All daily development commands run through Nx:

```bash
# Start the Python dev server with live reload
yarn nx serve ml-inference

# Run unit tests
yarn nx test ml-inference

# Run Ruff linter
yarn nx lint ml-inference

# Auto-format code with Ruff
yarn nx format ml-inference

# Run strict type checking with Mypy
yarn nx typecheck ml-inference

# (gRPC only) Recompile .proto stubs
yarn nx proto embeddings
```

---

## Step-by-Step Tutorial: Adding Custom Endpoints

### Scenario A: Adding an Image Classification Route to FastAPI

Suppose you generated `apps/microservices/vision` with `--framework=fastapi`.

#### 1. Define Request/Response Models in Python (`apps/microservices/vision/src/main.py`)

```python
from pydantic import BaseModel

class ClassifyRequest(BaseModel):
    image_url: str

class ClassifyResponse(BaseModel):
    label: str
    confidence: float

@app.post("/v1/classify", response_model=ClassifyResponse)
async def classify(payload: ClassifyRequest) -> ClassifyResponse:
    # Your computer vision / ML inference logic here
    return ClassifyResponse(label="cat", confidence=0.98)
```

#### 2. Add Method to the Client Library (`libs/vision-client/src/lib/vision-client.service.ts`)

```typescript
export interface ClassifyRequest {
  imageUrl: string;
}

export interface ClassifyResponse {
  label: string;
  confidence: number;
}

@Injectable()
export class VisionClientService {
  // ... constructor ...

  async classify(dto: ClassifyRequest): Promise<ClassifyResponse> {
    const response = await this.http.post<ClassifyResponse>('/v1/classify', {
      image_url: dto.imageUrl,
    });
    return response.data;
  }
}
```

#### 3. Expose via Gateway Controller (`apps/api/src/app/vision/vision.controller.ts`)

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VisionClientService, type ClassifyResponse } from '@icore/vision-client';

@ApiTags('vision')
@ApiBearerAuth()
@Controller('vision')
export class VisionController {
  constructor(private readonly vision: VisionClientService) {}

  @Post('classify')
  @ApiOperation({ summary: 'Classify an image' })
  classify(@Body() body: { imageUrl: string }): Promise<ClassifyResponse> {
    return this.vision.classify(body);
  }
}
```

Your new endpoint is now live at `POST /api/vision/classify` and automatically visible in Swagger at `http://localhost:3001/api/docs`.

---

### Scenario B: Adding an RPC Method to gRPC

Suppose you generated `apps/microservices/embeddings` with `--framework=grpc`.

#### 1. Update the Protobuf Definition (`apps/microservices/embeddings/protos/embeddings.proto`)

```proto
syntax = "proto3";

package embeddings;

service EmbeddingsService {
  rpc Ping (PingRequest) returns (PingResponse);
  rpc Generate (GenerateRequest) returns (GenerateResponse);
}

message GenerateRequest {
  string text = 1;
}

message GenerateResponse {
  repeated float vector = 1;
  int32 dimensions = 2;
}

message PingRequest {}
message PingResponse {
  string status = 1;
  string service = 2;
  string timestamp = 3;
}
```

#### 2. Recompile Protobuf Stubs

```bash
yarn nx proto embeddings
```

This compiles the Python stubs into `apps/microservices/embeddings/src/generated/`.

#### 3. Implement the Handler in `main.py`

```python
class EmbeddingsServicer:
    # ... Ping implementation ...

    async def Generate(self, request, context):
        # Generate 384-dimensional vector embedding
        dummy_vector = [0.01] * 384
        return pb2.GenerateResponse(vector=dummy_vector, dimensions=384)
```

#### 4. Call from the NestJS Client Service (`libs/embeddings-client/`)

```typescript
interface EmbeddingsGrpcService {
  ping(data: Record<string, never>): Observable<EmbeddingsPingResponse>;
  generate(data: { text: string }): Observable<{ vector: number[]; dimensions: number }>;
}

@Injectable()
export class EmbeddingsClientService implements OnModuleInit {
  private rpcService!: EmbeddingsGrpcService;

  constructor(@Inject(EMBEDDINGS_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.rpcService = this.client.getService<EmbeddingsGrpcService>('EmbeddingsService');
  }

  generate(text: string): Promise<{ vector: number[]; dimensions: number }> {
    return firstValueFrom(this.rpcService.generate({ text }));
  }
}
```

---

## Production Docker Builds

Every generated Python microservice includes a multi-stage `Dockerfile` leveraging Astral `uv` layer caching:

```bash
# Build the Docker image from workspace root
docker build -f apps/microservices/ml-inference/Dockerfile -t ml-inference:latest .

# Run the container
docker run -p 4006:4006 --env-file apps/microservices/ml-inference/.env ml-inference:latest
```

The container runs with non-root permissions, bytecode pre-compilation enabled (`UV_COMPILE_BYTECODE=1`), and only installs production dependencies (`uv sync --no-dev`).
