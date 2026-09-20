---
'@idevconn/create-icore': patch
---

Closes the `client-antd` / `client-mui` OAuth session-bootstrap gap
(GitHub issue #330) left open by the BFF session-auth migration. Both
templates now ship an `AuthBootstrap` component (parity with
`client-shadcn`'s) that resolves the logged-in user from the `icore_sid`
session cookie via `GET /auth/session` on mount, wired into each
template's `main.tsx` around `<RouterProvider>`. `writeClientEnv`
(`tools/create-icore/src/lib/scaffold-env.ts`) no longer forces
`VITE_AUTH_HAS_OAUTH=false` for `--client=antd|mui` — the OAuth button now
follows the same auth-provider capability rule as every other UI
template, since the OAuth redirect-to-`/dashboard`-with-cookies-only flow
now works on all three.
