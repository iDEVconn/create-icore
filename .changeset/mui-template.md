---
'@idevconn/create-icore': minor
---

Add the MUI 6 client template. `--ui=mui` no longer falls back to shadcn; it scaffolds a real MUI SPA with the same route tree (`/`, `/login`, `/_dashboard/dashboard`, `/_dashboard/profile`), `setNotifier` wired to a custom MUI Snackbar host (Zustand-backed queue + stacked Alert toasts), and the `PageLayout` / `AccessDeniedPage` / `MainLayout` shape mirroring the shadcn and antd templates. All three UI dimensions of the CLI are now first-class — no UI choice falls back any more.
