---
'@idevconn/create-icore': patch
---

fix(client): generated shadcn/mui clients typecheck in every mode. MUI 9 system props (`mb`, `fontWeight`, `alignItems`, ...) on `Typography`/`Stack` moved into `sx` (they were silently ignored at runtime), `TextField` `inputProps` -> `slotProps.htmlInput`, `nav.config.ts` keeps the `aiUsage` icon name for shadcn, the shadcn spec tsconfig loads `vite-plugin-pwa/react`, and the `--auth=none` shadcn `PageLayout` accepts the CASL gate props. Link-mode scaffold smoke now typechecks the client.
