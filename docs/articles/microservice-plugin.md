# Microservice Extension & Plugin Guide (`@icore/workspace-plugin`)

The `@icore/workspace-plugin:microservice` generator automates creating and wiring a new NestJS microservice into the iCore monorepo. It enforces iCore's 3-tier architecture, generates client libraries and REST gateway proxies, and safely connects everything via TypeScript AST manipulation.

> [!TIP]
> Looking to build a Python microservice with FastAPI or gRPC? See the [Python Microservice Plugin Guide](./python-microservice-plugin.md).

---

## Architecture Overview

In iCore, client applications (web/mobile) never connect directly to microservices. All requests pass through the NestJS API Gateway (BFF), which delegates to microservices over a decoupled message transport.

```text
Browser / Frontend
       │
       ▼ (HTTP: POST /api/billing/invoices)
[API Gateway] apps/api/src/app/billing/billing.controller.ts
       │
       ▼ (calls this.billing.createInvoice())
[Client Lib] libs/billing-client/src/lib/billing-client.service.ts
       │
       ▼ (Transport: TCP / Redis / NATS / RMQ / Kafka)
[Microservice] apps/microservices/billing/src/app/app.controller.ts
       │
       ▼ (business logic & database storage)
[Service / DB] apps/microservices/billing/src/app/app.service.ts
```

---

## Generator Command & CLI Flags

Run the generator using Nx:

```bash
# Preview changes in dry-run mode
yarn nx g @icore/workspace-plugin:microservice billing --dry-run --no-interactive

# Scaffold microservice with automated gateway wiring
yarn nx g @icore/workspace-plugin:microservice billing --no-interactive

# Scaffold with DBStrategy and Dockerfile
yarn nx g @icore/workspace-plugin:microservice billing --withDb --withDocker --no-interactive
```

### Argument & Flag Reference

| Flag                | Type      | Default              | Description                                                                                                                                                                             |
| :------------------ | :-------- | :------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name` _(required)_ | `string`  | _(1st argument)_     | Name of the microservice (e.g. `billing`, `notifications`, `service-one`). Automatically normalized to kebab-case, PascalCase, and SCREAMING_SNAKE_CASE.                                |
| `--transport`       | `enum`    | _(auto-detected)_    | Transport protocol (`tcp`, `redis`, `nats`, `mqtt`, `rmq`, `kafka`). If omitted, auto-detects from `apps/api/.env` (falling back to `tcp`).                                             |
| `--port`            | `number`  | _(auto-incremented)_ | TCP transport port. If omitted, scans existing microservices in the workspace and picks the next available port (`4006`, `4007`, etc.).                                                 |
| `--inspectPort`     | `number`  | _(auto-incremented)_ | Node.js debugger/inspect port for `nx serve`. Scans existing services and picks the next free port (`9235`, `9236`, etc.).                                                              |
| `--withDb`          | `boolean` | `false`              | Generates `db.provider.ts` and injects `DBStrategy` into the microservice, using the workspace's active database provider (`supabase`, `postgres`, `mongodb`, `firebase`, or `sqlite`). |
| `--withDocker`      | `boolean` | `false`              | Generates a multi-stage production Dockerfile (`Dockerfile.ms-<name>`) at the workspace root.                                                                                           |
| `--skipBff`         | `boolean` | `false`              | Skips generating `libs/<name>-client` and skips wiring the service into `apps/api`. Use when building an internal-only background worker.                                               |
| `--tags`            | `string`  | `""`                 | Comma-separated extra tags to append to `project.json` (defaults to `["type:microservice", "scope:<name>"]`).                                                                           |

---

## What Gets Generated & Wired

When you run `yarn nx g @icore/workspace-plugin:microservice <name>`:

### 1. Microservice (`apps/microservices/<name>/`)

- **`src/main.ts`**: Bootstraps the microservice using `bootstrapMicroservice('<PREFIX>', ...)` and `buildTransportMS('<PREFIX>')` from `@icore/shared`.
- **`src/app/app.module.ts`**: Configures environment loading from both `apps/microservices/<name>/.env` and root `.env`.
- **`src/app/app.controller.ts`**: Listens on `@MessagePattern('<name>.ping')`.
- **`src/app/app.service.ts`**: Returns health status (and injects `DBStrategy` if `--withDb` is set).
- **`src/app/__tests__/app.controller.unit.test.ts`**: Ready-to-run Vitest unit test.
- **Config & Targets**: `project.json` (`build`, `serve`, `prune`), `package.json`, `webpack.config.js`, `vitest.config.mts`, `tsconfig.json`, `tsconfig.app.json`, `.env.example`, and `.env`.

### 2. Client Library (`libs/<name>-client/` → `@icore/<name>-client`)

- **`<name>-client.tokens.ts`**: Defines the injection token (e.g. `BILLING_CLIENT`).
- **`<name>-client.service.ts`**: Wraps `ClientProxy` calls with typed RxJS `firstValueFrom` methods.
- **`<name>-client.module.ts`**: Exports `<Name>ClientModule.forRoot()` configuring `ClientsModule.registerAsync` with `buildTransport('<PREFIX>')`.

### 3. API Gateway Feature Module (`apps/api/src/app/<name>/`)

- **`<name>.module.ts`**: Imports `<Name>ClientModule.forRoot()` and registers the controller.
- **`<name>.controller.ts`**: Exposes `@Get('health')` (`GET /api/<name>/health`) with Swagger `@ApiTags` and `@ApiBearerAuth`.

### 4. Automatic TypeScript AST Modifications

Without modifying other parts of your code, the generator uses TypeScript AST manipulation to:

- Inject `<Name>Module` into `@Module({ imports: [...] })` in [`apps/api/src/app/features.module.ts`](file:///Volumes/Project/idevconn/create-icore/apps/api/src/app/features.module.ts).
- Register `{ name: '<name>', prefix: '<PREFIX>' }` in [`apps/api/src/app/gateway-services.ts`](file:///Volumes/Project/idevconn/create-icore/apps/api/src/app/gateway-services.ts).
- Add path mapping `"@icore/<name>-client"` into [`tsconfig.base.json`](file:///Volumes/Project/idevconn/create-icore/tsconfig.base.json).
- Add `"@icore/<name>-client": "*"` dependency into [`apps/api/package.json`](file:///Volumes/Project/idevconn/create-icore/apps/api/package.json).
- Append `${PREFIX}_*` transport environment variables to [`apps/api/.env.example`](file:///Volumes/Project/idevconn/create-icore/apps/api/.env.example) and `.env`.

---

## Step-by-Step Developer Guide: Extending Your Microservice

### Example: Adding a "Create Invoice" Feature to `billing`

#### Step 1: Implement the RPC Handler in the Microservice

In `apps/microservices/billing/src/app/app.controller.ts`:

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AppService, type InvoiceDto, type InvoiceRecord } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern('billing.createInvoice')
  createInvoice(@Payload() payload: InvoiceDto): Promise<InvoiceRecord> {
    return this.appService.createInvoice(payload);
  }
}
```

In `apps/microservices/billing/src/app/app.service.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DBStrategy } from '@icore/shared';

export interface InvoiceDto {
  customerId: string;
  amount: number;
}

export interface InvoiceRecord extends InvoiceDto {
  id: string;
  status: 'pending' | 'paid';
  createdAt: string;
}

@Injectable()
export class AppService {
  constructor(@Inject('DBStrategy') private readonly db: DBStrategy) {}

  async createInvoice(dto: InvoiceDto): Promise<InvoiceRecord> {
    const id = randomUUID();
    const invoice: InvoiceRecord = {
      id,
      ...dto,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await this.db.set('invoices', id, invoice);
    return invoice;
  }
}
```

---

#### Step 2: Add Method to Client Library

In `libs/billing-client/src/lib/billing-client.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { BILLING_CLIENT } from './billing-client.tokens';

export interface CreateInvoiceInput {
  customerId: string;
  amount: number;
}

export interface InvoiceResult {
  id: string;
  customerId: string;
  amount: number;
  status: 'pending' | 'paid';
  createdAt: string;
}

@Injectable()
export class BillingClientService {
  constructor(@Inject(BILLING_CLIENT) private readonly client: ClientProxy) {}

  createInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
    return firstValueFrom(this.client.send<InvoiceResult>('billing.createInvoice', input));
  }
}
```

---

#### Step 3: Expose REST Endpoint in API Gateway (BFF)

In `apps/api/src/app/billing/billing.controller.ts`:

```typescript
import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  BillingClientService,
  type CreateInvoiceInput,
  type InvoiceResult,
} from '@icore/billing-client';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingClientService) {}

  @Post('invoices')
  @ApiOperation({ summary: 'Create a new invoice' })
  createInvoice(@Body() body: CreateInvoiceInput): Promise<InvoiceResult> {
    return this.billing.createInvoice(body);
  }
}
```

Now, `POST /api/billing/invoices` is immediately available in Swagger at `http://localhost:3001/api/docs` and proxies directly to the microservice.

---

## Cross-Module & Event-Driven Consumption

### Consuming from Another Gateway Module

Any other module in `apps/api` can consume `BillingClientService`:

```typescript
import { Module } from '@nestjs/common';
import { BillingClientModule } from '@icore/billing-client';
import { OrdersService } from './orders.service';

@Module({
  imports: [BillingClientModule.forRoot()],
  providers: [OrdersService],
})
export class OrdersModule {}
```

### Event-Driven Pub/Sub (`client.emit`)

For fire-and-forget asynchronous workflows (e.g. notifications, audit logs):

1. **Emit an event** from any caller:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BILLING_CLIENT } from '@icore/billing-client';

@Injectable()
export class OrderProcessor {
  constructor(@Inject(BILLING_CLIENT) private readonly billingClient: ClientProxy) {}

  notifyOrderCompleted(orderId: string) {
    this.billingClient.emit('billing.order_completed', { orderId });
  }
}
```

2. **Handle the event** in the microservice:

```typescript
@EventPattern('billing.order_completed')
handleOrderCompleted(@Payload() data: { orderId: string }) {
  // Asynchronous background handling (no response returned to caller)
}
```

---

## Development & Operations

```bash
# Start all projects (gateway + microservices + client)
yarn dev

# Serve only the new microservice
yarn nx serve billing

# Run tests
yarn nx test billing
yarn nx test billing-client

# Build microservice bundle
yarn nx build billing

# Build production Docker image (if --withDocker was used)
docker build -f Dockerfile.ms-billing -t my-app/billing .
```
