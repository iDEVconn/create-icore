---
'@idevconn/create-icore': minor
---

Add the `--api=rest|graphql|both` option: `graphql` serves notes, profile and storage as GraphQL on `/api/graphql` (and the client uses it), `both` adds `/api/graphql` next to REST; auth, uploads, webhooks and admin stay REST. `rest` (default) output is unchanged apart from the shared guard/service refactor.
