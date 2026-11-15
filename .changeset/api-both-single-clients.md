---
'@idevconn/create-icore': patch
---

fix(api): `--api=both` shares one notes/upload microservice client between the REST and GraphQL surfaces (`forRoot()` is memoized), and `NotesController` takes `NotesGatewayService` directly instead of the `@Optional()` shim.
