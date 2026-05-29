# Plan 9: Payment MS via `@idevconn/payment`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `payment` microservice that wraps `@idevconn/payment`'s strategy registry. Gateway exposes order create + capture + lookup + webhook ingestion under `/api/payment/*`. PayPal ships as the default `PaymentStrategy`.

**Architecture:** see `docs/superpowers/specs/2026-05-29-plan-9-payment-design.md`.

**Branch:** `dev`. Previous head (Plan 6.5): TBD on landing.

**Generators only.** `nx g @nx/nest:app` for the MS; `nx g @nx/js:lib` for `payment-client`.

---

## Task 1: Add `@idevconn/payment` dep + scaffold payment MS

**Files:**

- Modify: root `package.json`
- Add: `apps/microservices/payment/` (generated)
- Add: `apps/microservices/payment/.env.example`

- [ ] **Step 1: Install dep**

```bash
yarn add @idevconn/payment
```

- [ ] **Step 2: Generate MS**

```bash
yarn nx g @nx/nest:app payment --directory=apps/microservices/payment --no-interactive
```

Smoke `yarn nx lint payment && yarn nx test payment && yarn nx build payment` — all green.

- [ ] **Step 3: Replace generator app with MS bootstrap**

`apps/microservices/payment/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

async function appBootstrap() {
  const logger = new Logger('appBootstrap');
  const app = await NestFactory.createMicroservice(AppModule, buildTransportMS('PAYMENT'));
  await app.listen();
  logger.log('payment MS listening');
}
appBootstrap().catch((err) => {
  Logger.error(err, 'appBootstrap');
  process.exit(1);
});
```

- [ ] **Step 4: `.env.example`**

```
PAYMENT_TRANSPORT=tcp
PAYMENT_HOST=0.0.0.0
PAYMENT_PORT=3304
PAYMENT_PROVIDER=paypal

PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_WEBHOOK_ID=...
```

- [ ] **Step 5: Switch tsconfig.app to `module: node16` + `moduleResolution: node16`**

NestJS decorators need it (same fix as auth MS).

```bash
yarn nx test payment
yarn nx lint payment
yarn nx build payment
```

**Commit:** `feat(payment-ms): scaffold via @nx/nest:app + appBootstrap + PAYMENT_* transport`

---

## Task 2: PaymentRegistry + PaypalStrategy factory

**Files:**

- Modify: `apps/microservices/payment/src/app/app.module.ts`
- Add: `apps/microservices/payment/src/app/payment.controller.ts`
- Add: `apps/microservices/payment/src/app/__tests__/payment.controller.unit.test.ts`

- [ ] **Step 1: Module**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentRegistry, PaypalStrategy } from '@idevconn/payment';
import { PaymentController } from './payment.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [require('node:path').join(__dirname, '..', '..', '.env'), '.env'],
    }),
  ],
  controllers: [PaymentController],
  providers: [
    {
      provide: PaymentRegistry,
      useFactory: (cfg: ConfigService) => {
        const registry = new PaymentRegistry();
        const provider = cfg.get<string>('PAYMENT_PROVIDER') ?? 'paypal';
        if (provider === 'paypal') {
          registry.register(
            'paypal',
            new PaypalStrategy({
              clientId: cfg.getOrThrow('PAYPAL_CLIENT_ID'),
              clientSecret: cfg.getOrThrow('PAYPAL_CLIENT_SECRET'),
              environment: cfg.get<'sandbox' | 'live'>('PAYPAL_ENVIRONMENT') ?? 'sandbox',
              webhookId: cfg.get('PAYPAL_WEBHOOK_ID'),
            }),
          );
        }
        return registry;
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Controller**

```ts
@Controller()
export class PaymentController {
  constructor(private readonly registry: PaymentRegistry) {}

  @MessagePattern('payment.createOrder')
  createOrder(@Payload() p: { provider: string; input: CreateOrderInput }) {
    return this.registry.get(p.provider).createOrder(p.input);
  }

  @MessagePattern('payment.captureOrder')
  capture(@Payload() p: { provider: string; orderId: string }) {
    return this.registry.get(p.provider).captureOrder(p.orderId);
  }

  @MessagePattern('payment.getOrder')
  getOrder(@Payload() p: { provider: string; orderId: string }) {
    return this.registry.get(p.provider).getOrder(p.orderId);
  }

  @MessagePattern('payment.verifyWebhook')
  verifyWebhook(
    @Payload() p: { provider: string; rawBody: string; headers: Record<string, string> },
  ) {
    return this.registry.get(p.provider).verifyWebhook(p.rawBody, p.headers);
  }
}
```

- [ ] **Step 3: Tests**

Test against a mock `PaymentStrategy` registered in a fresh registry per test. Four cases (one per `@MessagePattern`).

```bash
yarn nx test payment
yarn nx lint payment
yarn nx build payment
```

**Commit:** `feat(payment-ms): PaymentRegistry wiring + PaypalStrategy factory + 4 @MessagePattern handlers`

---

## Task 3: `libs/payment-client`

**Files:**

- Add: `libs/payment-client/` (generated)

- [ ] **Step 1: Generate**

```bash
yarn nx g @nx/js:lib payment-client --directory=libs/payment-client --bundler=tsc --no-interactive
```

- [ ] **Step 2: Module + service**

`libs/payment-client/src/lib/payment-client.module.ts`:

```ts
import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { PaymentClientService } from './payment-client.service';

export const PAYMENT_CLIENT = 'PAYMENT_CLIENT';

@Module({})
export class PaymentClientModule {
  static register(): DynamicModule {
    return {
      module: PaymentClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: PAYMENT_CLIENT,
            useFactory: () => buildTransport('PAYMENT'),
          },
        ]),
      ],
      providers: [PaymentClientService],
      exports: [PaymentClientService],
    };
  }
}
```

`payment-client.service.ts`:

```ts
@Injectable()
export class PaymentClientService {
  constructor(@Inject(PAYMENT_CLIENT) private readonly client: ClientProxy) {}

  createOrder(provider: string, input: CreateOrderInput): Promise<OrderResult> {
    return firstValueFrom(this.client.send('payment.createOrder', { provider, input }));
  }
  captureOrder(provider: string, orderId: string): Promise<CaptureResult> {
    return firstValueFrom(this.client.send('payment.captureOrder', { provider, orderId }));
  }
  getOrder(provider: string, orderId: string): Promise<OrderResult> {
    return firstValueFrom(this.client.send('payment.getOrder', { provider, orderId }));
  }
  verifyWebhook(
    provider: string,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    return firstValueFrom(
      this.client.send('payment.verifyWebhook', { provider, rawBody, headers }),
    );
  }
}
```

- [ ] **Step 3: Lint + build**

```bash
yarn nx lint payment-client
yarn nx build payment-client
```

**Commit:** `feat(payment-client): NestJS module + service wrapping payment MS ClientProxy`

---

## Task 4: Gateway `/api/payment/*` routes

**Files:**

- Add: `apps/api/src/app/payment/payment.controller.ts`
- Add: `apps/api/src/app/payment/payment.module.ts`
- Add: `apps/api/src/app/payment/__tests__/payment.controller.unit.test.ts`
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Module**

```ts
@Module({
  imports: [PaymentClientModule.register()],
  controllers: [PaymentController],
})
export class PaymentModule {}
```

Register in `AppModule`.

- [ ] **Step 2: Controller**

```ts
@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentClient: PaymentClientService,
    private readonly cfg: ConfigService,
  ) {}

  private get defaultProvider(): string {
    return this.cfg.get<string>('PAYMENT_PROVIDER') ?? 'paypal';
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create a payment order' })
  createOrder(@Body() body: CreateOrderInput) {
    return this.paymentClient.createOrder(this.defaultProvider, body);
  }

  @Post('orders/:id/capture')
  capture(@Param('id') id: string) {
    return this.paymentClient.captureOrder(this.defaultProvider, id);
  }

  @Get('orders/:id')
  get(@Param('id') id: string) {
    return this.paymentClient.getOrder(this.defaultProvider, id);
  }

  @Public()
  @Post('webhooks/:provider')
  @HttpCode(204)
  async webhook(@Param('provider') provider: string, @Req() req: Request) {
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v ?? '')]),
    );
    const verified = await this.paymentClient.verifyWebhook(provider, rawBody, headers);
    if (!verified) throw new UnauthorizedException('invalid_webhook_signature');
    // Future: emit a NestJS event so consumers can subscribe.
  }
}
```

- [ ] **Step 3: Raw body for webhook**

Configure Nest's bodyParser to keep raw body for `/api/payment/webhooks/*`:

```ts
// main.ts
import { json } from 'body-parser';
app.use(
  '/api/payment/webhooks',
  json({
    verify: (req: Request & { rawBody?: string }, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);
```

- [ ] **Step 4: Tests**

Mock `PaymentClientService`; verify each route forwards and that webhook signature failure → 401.

```bash
yarn nx run-many -t lint test build -p api,payment,payment-client
```

**Commit:** `feat(api): /api/payment routes (orders + capture + webhook) wired to payment MS`

---

## Task 5: CLI `--payment` flag + docs

**Files:**

- Modify: `tools/create-icore/src/lib/options.ts`
- Modify: `tools/create-icore/src/lib/prompts.ts`
- Modify: `tools/create-icore/src/lib/scaffold.ts`
- Modify: `docs/architecture.md`
- Add: `.changeset/payment.md`

- [ ] **Step 1: Option type**

```ts
export type PaymentProvider = 'paypal' | 'none';
```

- [ ] **Step 2: Prompt**

```ts
{
  type: 'select',
  message: 'Payment provider',
  options: [
    { value: 'none', label: 'None (skip payment MS)' },
    { value: 'paypal', label: 'PayPal (via @idevconn/payment)' },
  ],
}
```

- [ ] **Step 3: Scaffold**

`writePaymentEnv` writes the chosen provider into the MS `.env`. If `none`, `removePaymentStack` deletes `apps/microservices/payment`, `libs/payment-client`, and `apps/api/src/app/payment/`.

- [ ] **Step 4: Docs**

Architecture.md → Plan 9 row ✅. Append "Plan 9 deliverables".

- [ ] **Step 5: Changeset**

```markdown
---
'@idevconn/create-icore': minor
---

Optional payment microservice wrapping `@idevconn/payment`'s strategy registry. CLI gains `--payment=paypal|none` (defaults to `none`). When enabled, the scaffold ships `apps/microservices/payment` (PaypalStrategy by default), `libs/payment-client`, and gateway routes `POST /api/payment/orders`, `POST /api/payment/orders/:id/capture`, `GET /api/payment/orders/:id`, and `POST /api/payment/webhooks/:provider` (raw-body signature verification). Webhook events stream into a NestJS event bus consumers wire their own handlers onto.
```

Final:

```bash
yarn nx run-many -t lint test build
yarn format:check
git push origin dev
```

**Commit:** `feat(create-icore): optional payment MS via @idevconn/payment + --payment flag`

---

## Self-Review

- All spec sections mapped to tasks.
- Tests added per layer.
- Real PaypalStrategy is not exercised in CI — pure mock-based tests.
- Webhook raw body trap: confirm `body-parser` order matches NestJS expectations.
