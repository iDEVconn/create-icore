---
'@idevconn/create-icore': patch
---

Fix generated docker-compose.yml: ship Dockerfile.ms-payment, and drop the payment service (depends_on, PAYMENT_* env, Dockerfile) when payment=none.
