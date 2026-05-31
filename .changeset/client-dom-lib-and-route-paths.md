---
'@idevconn/create-icore': patch
---

Fix the generated client failing to typecheck: `TS2304: Cannot find name 'window'`/`'document'` and wrong route link targets.

- **DOM lib:** the client `tsconfig.json` (all three UI variants) set no `lib`, so it inherited the base `["ES2022"]` — no DOM. `window`/`document`/DOM types were undefined under `tsc`/IDE (Vite's build masked it). Added `lib: ["ES2022", "DOM", "DOM.Iterable"]`.
- **Route paths:** links and `navigate({ to })` used `/_dashboard/<x>`, but `_dashboard` is a pathless layout — the real URL (and the generated route union) is `/<x>`. Fixed every `to="/_dashboard/…"`, `navigate({ to: '/_dashboard/dashboard' })`, and the e2e `page.goto('/_dashboard/…')` to the correct `/dashboard` · `/notes` · `/profile`, across shadcn/antd/mui. This was both a type error and broken navigation.

All three client templates now `tsc --noEmit` clean.
