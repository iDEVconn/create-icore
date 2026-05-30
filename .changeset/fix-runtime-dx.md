---
'@idevconn/create-icore': minor
---

feat+fix: runtime DX overhaul and AI-ready scaffold

**Runtime fixes**

- _Circular DI import_: all `*-client` libs move their injection token to a
  dedicated `*.tokens.ts` leaf file — webpack bundling no longer causes
  `UndefinedDependencyException` at gateway startup.
- _Env banner_: MS factories collect **all** missing provider vars and print a
  boxed banner (`formatEnvBanner` + `missingEnv` in `@icore/shared`). Dev →
  warn + fake strategy; prod (`NODE_ENV=production`) → fail-fast.
- _Invalid placeholder values_ (e.g. `https://<your-project-ref>.supabase.co`)
  are caught by a try/catch around the SDK constructor and shown in the same
  banner with the SDK error as the reason.
- _Gateway startup banner_: `formatGatewayBanner` prints a boxed table of MS
  transport targets on boot.
- _Transport env banner_: `buildTransport` validates all required vars for the
  chosen transport kind and throws a readable banner instead of a cryptic error.
- _Dev API proxy_: all 3 client templates proxy `/api → http://localhost:3001`
  via `commonServer(port)` so the default `VITE_API_URL=/api` works in dev.
- _Client env_: `.env.example` added to all 3 templates; `writeClientEnv`
  copies it on scaffold.
- _`@icore/vite-plugins` additions_: `commonServer`, `apiInfoPlugin`,
  `commonManualChunks`, `commonTestConfig` — shared utilities reduce duplication
  across templates.
- _Payment MS_ env banner added (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).
- _Unique debug ports_: each MS serve target gets its own inspect port
  (9229–9234) to avoid address-in-use warnings.
- _`apps/api/.env` loaded_: `ConfigModule.forRoot` in the gateway now sets
  `envFilePath` so transport vars are actually read.

**AI-ready scaffold**

Every generated project now includes:

- `CLAUDE.md` → `@AGENTS.md` (Claude Code entry point)
- `AGENTS.md` — generated with stack snapshot, mandatory workflow rules, architecture, key patterns, commands, `.env` map — all interpolated from the chosen providers and package manager
- `.claude/settings.json` — `@nx/mcp` always; `@supabase/mcp` / firebase MCP when the matching provider is chosen; permissions for nx, dev, prettier, git
- `README.md` — stack table, quick-start, reference to iCore
