# Plan 9 — Payment MS via `@idevconn/payment`

**Date:** 2026-05-29
**Status:** Approved design — implementation lives in `docs/superpowers/plans/2026-05-29-plan-9-payment.md`.

## Goal

Add a `payment` microservice that wraps the existing `@idevconn/payment` package's strategy registry. Gateway exposes a thin REST surface for order creation + capture + webhook ingestion; the MS holds the registry and forwards calls to whichever `PaymentStrategy` is configured (`paypal` ships as default).

## Why reuse `@idevconn/payment`

The package already does the strategy-pattern work:

- `PaymentStrategy` interface (`createOrder`, `captureOrder`, `verifyWebhook`)
- `PaymentRegistry` for multi-provider hosting
- Concrete `PaypalStrategy` (sandbox + production)
- `parseCreateOrder` Zod validator
- `PaymentError` typed error class

icore's job is integration, not re-implementation. The MS wires the registry; the gateway adds auth + routing.

## Architecture

```
                  client (logged in)
                       │
                       ▼  POST /api/payment/orders { amount, currency }
                  ┌──────────┐
                  │  GATEWAY │  PaymentController (AuthGuard'd)
                  └────┬─────┘
                       │ TCP/Redis/NATS
                       ▼
              ┌─────────────────┐
              │   PAYMENT MS    │  PaymentRegistry.createOrder(...)
              │                 │     │
              │                 │     ▼
              │                 │  PaypalStrategy (or any registered strategy)
              └─────────────────┘
                       ▲
                       │  POST /api/payment/webhooks/:provider
                  ┌────┴─────┐
                  │  GATEWAY │  WebhookController (@Public + signature verify)
                  └──────────┘
                       ▲
                       │
                  provider (PayPal) → public webhook URL
```

## New libs / apps

| Path                          | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `apps/microservices/payment/` | Nest MS hosting `PaymentRegistry`              |
| `libs/payment-client/`        | gateway → payment MS NestJS ClientProxy module |

`@idevconn/payment` is added as a workspace dep. No fork or wrapper — the MS imports it directly.

## Gateway routes

```
POST /api/payment/orders                  AuthGuard, body: { amount, currency, ... }
                                          → 200 { orderId, status, approvalUrl? }
POST /api/payment/orders/:id/capture      AuthGuard
                                          → 200 { orderId, captureId, status, amount }
GET  /api/payment/orders/:id              AuthGuard
                                          → 200 OrderResult
POST /api/payment/webhooks/:provider      @Public, raw body, signature verify
                                          → 204 (queued for async handling)
```

Webhook signature verification uses the strategy's `verifyWebhook(rawBody, headers)`; invalid signatures get a 401. After verify the MS emits a NestJS event (`payment.order.captured`, `payment.order.refunded`) that consumers subscribe to in their own code.

## Env

| Var                                         | Purpose                                             | Used by    |
| ------------------------------------------- | --------------------------------------------------- | ---------- |
| `PAYMENT_TRANSPORT` / host / port / url     | MS ↔ gateway transport — same shape as auth/upload | both       |
| `PAYMENT_PROVIDER`                          | `paypal` (default; future: `stripe`)                | payment MS |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | paypal credentials                                  | payment MS |
| `PAYPAL_ENVIRONMENT`                        | `sandbox` (default) or `live`                       | payment MS |
| `PAYPAL_WEBHOOK_ID`                         | for signature verification                          | payment MS |

## CLI integration

CLI `--payment=paypal|none` flag:

- `paypal` → writes `PAYMENT_PROVIDER=paypal` + scaffolds `apps/microservices/payment` with PaypalStrategy
- `none` → removes the payment MS + payment-client + `/api/payment/*` controller

Default: `none` (icore consumers opt-in).

## Out of scope

- **Entitlements / feature flags** — Plan 9 ships payment plumbing only. Mapping "user X paid → user X can access feature Y" is consumer territory; the events emitted by the MS are the integration hook.
- **Subscriptions** — `@idevconn/payment` v1.2 ships one-shot orders only. Subscription support is a future package feature.
- **Multi-currency conversion** — pass-through whatever the provider supports.
- **Idempotency keys** — `@idevconn/payment` handles its own; we don't add a second layer.
- **Stripe** — provider package would ship `StripeStrategy`; icore consumes it when available.

## Tests

- MS-level: `PaymentController` test with `PaymentRegistry` carrying a mock strategy.
- Gateway-level: `PaymentController` test mocks `PaymentClientService`, verifies auth-guarded routes + `@Public` webhook + signature verify path (signature failure → 401).
- E2E: smoke against the real PaypalStrategy in sandbox env, gated by `PAYPAL_SANDBOX=1` env so it skips when secrets are absent.
