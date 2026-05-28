---
'@idevconn/create-icore': minor
---

Add the Ant Design 6 client template. `--ui=antd` no longer falls back to shadcn; it scaffolds a real antd SPA with the same route tree (`/`, `/login`, `/_dashboard/dashboard`, `/_dashboard/profile`), `setNotifier` host wired to antd's `notification`, and the `PageLayout` / `AccessDeniedPage` / `MainLayout` shape mirroring `ui-main/apps/client/src/layouts/`. MUI still falls back to shadcn until Plan 6.2 lands.
