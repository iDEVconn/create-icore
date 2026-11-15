---
'@idevconn/create-icore': patch
---

fix(create-icore): a `--auth=none` gateway now rate-limits. Its generated `app.module.ts` registers the gateway's `throttlerOptions` (the `default` 120/min floor plus the scoped `auth-burst`/`ai-burst`) and the global `ContextAwareThrottlerGuard` as `APP_GUARD`; the guard used to live only in the auth module, so `rest` + `auth=none` had `ThrottlerModule` and no enforcement.
