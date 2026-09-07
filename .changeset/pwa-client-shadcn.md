---
"@idevconn/create-icore": minor
---

`client-shadcn` is now a PWA, not just an SPA: `vite-plugin-pwa` generates a manifest + service worker (`registerType: 'autoUpdate'`), with a strict cache policy — `/api/*` is `NetworkOnly` (auth/session/business data must never be served stale or offline), static assets get `StaleWhileRevalidate`/`CacheFirst`. Added `UpdatePrompt` (reload toast when a new version is available) and `OfflineBanner` (shown while `navigator.onLine` is false). Placeholder icons are generated flat-color PNGs — see the new `apps/templates/client-shadcn/README.md` for what to replace before shipping. P2 item #10 from the third-party iCore infrastructure audit; `client-antd`/`client-mui` are not covered by this PR.
