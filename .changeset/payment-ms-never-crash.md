---
"@idevconn/create-icore": patch
---

Payment MS no longer crash-loops in production when PayPal credentials are missing. The `PaymentRegistry` factory now always registers a strategy for the configured provider — a real one when creds are present, otherwise `FakePaymentStrategy`, which rejects payment calls with a 503 until creds are set.
