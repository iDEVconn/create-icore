# Task 8b — Fix regression: antd/mui broken by Task 5's auth response shape change

## Context

Task 5 (already merged) changed the gateway's `POST /auth/login` / `register` /
`magic-link/verify` responses from `{ accessToken, refreshToken, user }` to
`{ user }` only (verified in `apps/api/src/app/auth/auth.controller.ts`'s
private `startSession()` helper, used by `register`, `login`, and
`verifyMagicLink`). It also changed the OAuth callback (`oauthCallback` /
`startSessionRedirect`) to set an httpOnly session cookie and redirect
straight to `/dashboard` — "no tokens in the URL fragment at all now... since
there is nothing left for client JS to read" (controller's own comment).

`client-shadcn` was already migrated to this model in an earlier task.
`client-antd` and `client-mui` were not, and — more severely than the task
brief anticipated — this isn't just a silent runtime bug: `setAccessToken`
and `getAccessToken` have been **removed entirely** from
`@icore/template-shared` (`libs/template-shared/src/lib/stores/auth.store.ts`
only exports `useAuthStore`/`useIsAdmin`/`AuthUser` now; no
`setAccessToken`/`getAccessToken` anywhere in the lib). So both templates
were failing to **compile** — `import { setAccessToken } from
'@icore/template-shared'` doesn't resolve — not just misbehaving at runtime.

## Grep — before

```
$ grep -rln "setAccessToken\|getAccessToken" apps/templates/client-antd/src apps/templates/client-mui/src
apps/templates/client-antd/src/routes/auth.oauth.callback.tsx
apps/templates/client-mui/src/components/auth/LoginForm.tsx
apps/templates/client-mui/src/routes/_dashboard.tsx
apps/templates/client-antd/src/components/auth/LoginForm.tsx
apps/templates/client-antd/src/routes/_dashboard.tsx
apps/templates/client-mui/src/routes/auth.oauth.callback.tsx
apps/templates/client-antd/src/routes/auth.callback.tsx
apps/templates/client-mui/src/routes/auth.callback.tsx
```

8 files (4 per template) — two more than the brief named explicitly
(`LoginForm.tsx`, `_dashboard.tsx`): `auth.oauth.callback.tsx` (OAuth) and
`auth.callback.tsx` (magic-link verify).

## Grep — after

```
$ grep -rn "setAccessToken\|getAccessToken" apps/templates/client-antd/src apps/templates/client-mui/src
(no output)
```

Zero hits — confirmed clean.

## What I implemented, file by file

Applied identically to both `client-antd` and `client-mui` unless noted.

1. **`components/auth/LoginForm.tsx`**
   - Removed `setAccessToken` from the `@icore/template-shared` import (kept
     `useAuthStore`, `useNotify`).
   - Removed `accessToken: string; refreshToken: string;` from the inline
     `api<{...}>('/auth/login', ...)` response type — now just
     `{ user: { id: string; email: string; role?: string } }`.
   - Removed the `setAccessToken(session.accessToken);` call; kept
     `setUser(session.user);`.

2. **`routes/_dashboard.tsx`**
   - Replaced `import { getAccessToken } from '@icore/template-shared'` with
     `import { useAuthStore } from '@icore/template-shared'`.
   - Replaced the `beforeLoad` guard: `if (!getAccessToken())` →
     `if (!useAuthStore.getState().user)`.

3. **`routes/auth.callback.tsx`** (magic-link verify — not named in the
   brief, found via grep). Verified this endpoint (`/auth/magic-link/verify`)
   also routes through the same `startSession()` helper as login/register, so
   it returns `{ user }` only too — same regression, same fix pattern:
   - Removed `setAccessToken` from the import.
   - Removed `accessToken`/`refreshToken` from the inline
     `api<{...}>('/auth/magic-link/verify', ...)` response type.
   - Removed the `setAccessToken(session.accessToken);` call; kept
     `setUser(session.user);`.

4. **`routes/auth.oauth.callback.tsx`** (OAuth callback — not named in the
   brief, found via grep). **This is the structurally-different case the
   brief told me to stop and think about rather than force a mechanical
   edit.** Its current logic reads `accessToken`/`userId`/`email` from the
   URL hash fragment (a pre-Task-5 contract). I confirmed via
   `apps/api/src/app/auth/auth.controller.ts`'s `oauthCallback` /
   `startSessionRedirect` that the gateway now sets the session cookie
   server-side and redirects straight to `${CLIENT_ORIGIN}/dashboard` —
   **no tokens are ever put in the URL for this flow anymore.** That makes
   this route's entire hash-param branch unreachable via the real
   Google/GitHub button flow, independent of anything I do here. Giving it
   real behavior (e.g. shadcn's new `/auth/session/adopt` adoption endpoint
   for a Supabase-implicit-flow fallback) is exactly the BFF-parity work the
   brief says is out of scope for this task.
   - I made only the minimal compile-safety edit: removed the `setAccessToken`
     import and the dead `setAccessToken(accessToken);` call, keeping
     `setUser({ id: userId, email });` and all existing gating/error-handling
     logic untouched.
   - Added a comment explaining the route is now practically dead code and
     flagging that a real fix needs a scoped follow-up decision.
   - I did **not** invent a new endpoint call or replicate shadcn's
     `/auth/session/adopt` flow — that would be scope creep beyond "restore a
     working (if architecturally simpler) state," and the brief explicitly
     asks me to raise this rather than guess.

## What I tested and results

- `npx prettier --write <8 touched files>` → all "(unchanged)" after edits
  (edits already matched house style); `npx prettier --check` on the same
  list → "All matched files use Prettier code style!"
- `yarn nx run-many -t vite:build -p client-antd,client-mui` → both succeeded
  (this is the real build target for these projects; plain `nx build
  client-antd` fails with "Cannot find configuration for task
  client-antd:build" — targets are `vite:build`/`vite:dev`/`vite:preview`).
- `yarn nx run-many -t test -p client-antd,client-mui` → both succeeded. Only
  existing test file touching these flows is
  `components/auth/__tests__/LoginForm.spec.tsx` in each template, which
  covers OAuth/magic-link **capability gating** (button visibility), not the
  submit/response-shape path — no test needed updating, and none broke.
- `yarn nx run-many -t lint -p client-antd,client-mui` → both succeeded, 0
  errors.

## Files changed

- `apps/templates/client-antd/src/components/auth/LoginForm.tsx`
- `apps/templates/client-antd/src/routes/_dashboard.tsx`
- `apps/templates/client-antd/src/routes/auth.callback.tsx`
- `apps/templates/client-antd/src/routes/auth.oauth.callback.tsx`
- `apps/templates/client-mui/src/components/auth/LoginForm.tsx`
- `apps/templates/client-mui/src/routes/_dashboard.tsx`
- `apps/templates/client-mui/src/routes/auth.callback.tsx`
- `apps/templates/client-mui/src/routes/auth.oauth.callback.tsx`

`git diff --stat` confirms exactly these 8 files, 20 insertions / 24
deletions total — no other files touched, no `client-shadcn`/`libs/` drift.

## Self-review

- **Completeness:** re-ran the grep after edits — zero hits. All
  `setAccessToken`/`getAccessToken` usages found and handled, including the
  two files beyond the brief's explicit list (magic-link callback, OAuth
  callback).
- **Quality:** each edit matched the file's own existing style (antd's
  `Form`/`Space` vs mui's `useState`/`Box` idioms untouched; only the
  auth-plumbing lines changed).
- **Discipline:** no BFF-parity scope creep — no `/auth/session/adopt` call
  added, no cookie-based bootstrap, no touching `client-shadcn` or
  `libs/template-shared`.
- **Testing:** both builds pass, both test suites pass, both lints pass.

## Issues / concerns for the human reviewer

1. **`setAccessToken`/`getAccessToken` were fully removed from
   `@icore/template-shared`**, not just deprecated — meaning antd/mui were
   in a **build-broken** state on this branch before this fix, not merely a
   silent runtime bug as the task brief described for `LoginForm.tsx`. Worth
   confirming CI wasn't green somewhere it shouldn't have been.
2. **`auth.oauth.callback.tsx` OAuth login is now dead code in both
   templates** (Google/GitHub buttons redirect through a flow that never
   reaches this route with usable data anymore). If `AUTH_HAS_OAUTH=true` is
   ever selected for a antd/mui scaffold, OAuth sign-in will not work — this
   was already true before my change (Task 5's backend redirect always went
   straight to `/dashboard` with cookies), my edit only kept it
   compile-clean, not functional. Recommend either: (a) explicitly disabling
   or hiding the OAuth buttons for antd/mui pending BFF parity, or (b) a
   follow-up task giving antd/mui the same `/auth/session/adopt` handling
   shadcn has. Flagging rather than deciding, per the task's own
   instruction.
