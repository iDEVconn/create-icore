---
'@idevconn/create-icore': patch
---

Upgrade `tsup` to 9, `vite-plugin-pwa` to 2 (client-shadcn template), `@anthropic-ai/sdk` to 1.x (ai-orchestrator) and align `@types/node` with the Node 24 runtime. `postgres` 4 stays on 3.x: it is ESM-only and the CommonJS strategies cannot `require` it.
