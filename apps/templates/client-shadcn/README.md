# client-shadcn

React 19 + Vite + shadcn/ui client template. See root `AGENTS.md` for the full architecture.

## PWA

This template is a PWA (`vite-plugin-pwa`, `vite.config.mts`), not just an SPA:

- **Cached** (`StaleWhileRevalidate` / `CacheFirst`, see `workbox.runtimeCaching`): JS/CSS bundles, fonts, and images. Safe to serve stale-then-refresh or fully offline — none of it is per-user or sensitive.
- **Never cached** (`NetworkOnly`): everything under `/api/*` — auth responses, JWTs, refresh tokens, and any business/medical data. A request that can't reach the network fails outright rather than silently replaying stale or cross-user data. Do not add an `/api/*` entry to `runtimeCaching` without re-reading why this exists.
- **Update flow**: `registerType: 'autoUpdate'` + `components/pwa/UpdatePrompt.tsx` — shows a persistent "New version available" toast with a Reload action once a new service worker is waiting. `components/pwa/OfflineBanner.tsx` shows a banner while `navigator.onLine` is false (API calls will fail while it's up, by design).

### Icons are placeholders

`public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/pwa-maskable-512x512.png`, and `public/apple-touch-icon.png` are flat-color placeholders generated for this scaffold — **replace them with real brand assets before shipping**. Update `manifest.icons` and `theme_color`/`background_color` in the `VitePWA({...})` config block (`vite.config.mts`) and the `<meta name="theme-color">` tag in `index.html` to match.
