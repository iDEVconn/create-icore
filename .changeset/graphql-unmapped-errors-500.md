---
'@idevconn/create-icore': patch
---

GraphQL: an unexpected resolver error (not an `HttpException`) now answers HTTP 500 `INTERNAL_SERVER_ERROR` and is logged, instead of HTTP 200 with `errors[]`.
