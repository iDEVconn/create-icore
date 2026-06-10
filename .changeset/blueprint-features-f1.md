---
'@idevconn/create-icore': minor
---

Features (notes/payment/jobs) gateway composition is now additive: the gateway app.module + main.ts are static and import a generated features.module.ts + gateway-services.ts assembled from the chosen feature set. The regex removePaymentStack/removeJobsStack are deleted and removeNotesStack is reduced to its client-only tail (LayoutSider + i18n, pending the client phase). Unchosen feature dirs/deps/tsconfig/transport/docker are pruned via the manifest — no gateway source-surgery.
