---
'@idevconn/create-icore': minor
---

feat: @icore/vite-plugins, cross-boundary guards, no-crash on missing .env

**@icore/vite-plugins** — new workspace lib shared by all client templates:
`noServerModulesPlugin`, `injectAppVersionPlugin`, `commonDefines`,
`commonManualChunks`, `commonTestConfig`. Replaces deprecated
`TanStackRouterVite` with `tanstackRouter`.

**No crash on missing .env** — MS factories wrap provider creation in
try/catch; `new Logger().warn()` + `Fake*Strategy` returned so all ports
bind without credentials. `writeNotesEnv` added to scaffold so the notes MS
`.env` is written at generate time (fixes `NOTES_HOST` crash on first `yarn dev`).

**Cross-boundary dependency guards** — Vitest static test catches `@nestjs/*`
in client-side source and `react/*` in server-side source. Vite
`no-server-modules` plugin in all 3 client templates fails the build if a
server-only module is accidentally imported in client code.

**`@icore/shared/client` sub-path** — browser-safe entry (abilities + types
only) so `@nestjs/microservices` never reaches the Vite bundle.
`ability-provider.tsx` updated to import from the sub-path.
