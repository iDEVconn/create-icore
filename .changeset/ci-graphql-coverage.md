---
'@idevconn/create-icore': patch
---

CI coverage for `--api=graphql|both`: scaffold-smoke combos for `--ui=none` and `--auth=none`, a nightly leg whose boot phase makes a real `/api/graphql` round trip (public `health`, and a 401 for an anonymous guarded query), and a `graphql-codegen` validation step in the generated project's `ci.yml`.
