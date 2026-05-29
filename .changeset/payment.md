---
'@idevconn/create-icore': minor
---

Optional payment microservice wrapping `@idevconn/payment`'s strategy registry. CLI gains `--payment=paypal|none` (defaults to `none`). When enabled, the scaffold ships `apps/microservices/payment` (PaypalStrategy by default, sandbox env), `libs/payment-client` (`@icore/payment-client`), and gateway routes `POST /api/payment/orders`, `POST /api/payment/orders/:id/capture`, `GET /api/payment/providers`. The gateway forwards an HTTP `Idempotency-Key` header as `RequestOptions.idempotencyKey`. Webhook + `getOrder` are deferred until `@idevconn/payment` exposes them.
