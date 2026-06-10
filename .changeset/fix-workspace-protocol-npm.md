---
'@idevconn/create-icore': patch
---

Fix `npm install` failing with `EUNSUPPORTEDPROTOCOL Unsupported URL Type "workspace:"` in generated projects. The root template shell (`@icore/vite-plugins`) and the three mongodb strategy libs (`@icore/shared`) hardcoded `"workspace:*"`, which npm rejects. They now use `"*"` (the documented invariant: templates use `*`; the pnpm rewrite adds the `workspace:` prefix for pnpm only). npm/yarn resolve `*` via the workspaces field; pnpm still gets `workspace:*` — all three package managers install cleanly.
