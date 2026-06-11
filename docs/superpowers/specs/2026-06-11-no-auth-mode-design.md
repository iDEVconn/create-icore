# Design: `authProvider = 'none'` — No-Auth Mode for create-icore

**Date:** 2026-06-11  
**Scope:** `tools/create-icore`  
**Status:** Approved

## Problem

Every project scaffolded by `create-icore` includes a full auth stack (auth microservice, strategy libs, AuthGuard, login/register routes). Some users want a minimal Nx monorepo — a gateway shell + React client — without login, protected routes, or auth infrastructure.

## Decision

Extend `AuthProvider` to include `'none'`. When chosen, `scaffold()` calls `removeAuthStack()` instead of `writeAuthProvider()`, stripping all auth-related files and wiring from the generated project. Pattern mirrors the existing `upload = 'none'` → `removeUploadStack()` approach.

---

## Architecture

### Type Changes (`lib/options.ts`)

```ts
export type AuthBackend = 'supabase' | 'firebase' | 'mongodb';
export type AuthProvider = AuthBackend | 'none';
export type DbProvider = 'supabase' | 'firebase' | 'mongodb' | 'none';
```

`AuthBackend` is used wherever the manifest/wire functions expect a concrete provider (they are never called with `'none'`). `DbProvider` gains `'none'` because when `authProvider === 'none'` the db question is skipped and the option must carry a valid value.

### Manifest (`manifest/types.ts`)

`Manifest.auth` stays `Record<AuthBackend, Unit>` — no change to the manifest data. The `'none'` value is handled entirely at the scaffold layer, not the manifest layer.

---

## Wizard Flow (`lib/prompts.ts` — `collectOptions`)

```
auth select  →  supabase | firebase | mongodb | none
  if none:
    dbProvider  = 'none'   (skip question)
    example     = 'none'   (skip question — notes demo requires auth)
    upload      →  ask normally
    transport   →  ask only if upload !== 'none' (else default 'tcp', no MS)
    payment, jobs, ui, git, install  →  normal
  else:
    (existing flow unchanged)
```

**CLI flags:** `--auth none` works via existing `parseFlags`. `--config` JSON accepts `auth: "none"`.  
**`validateConfig`:** add `'none'` to `VALID_AUTH_PROVIDERS`.

---

## `removeAuthStack(targetDir)` (`lib/scaffold-strip.ts`)

Called after `selectClientTemplate` (client files already at `apps/client/`).

### Delete

| Path | Reason |
|------|--------|
| `apps/microservices/auth` | Auth MS |
| `libs/auth-strategies` | All 3 strategy libs |
| `libs/auth-client` | Gateway→auth MS client lib |
| `Dockerfile.ms-auth` | No auth MS to build |
| `apps/api/src/app/auth/` | AuthController, AuthGuard, public.decorator |
| `apps/api/src/app/profile/` | ProfileController depends on `req.user` |
| `apps/api/src/app/abilities/` | AbilityGuard/Factory depends on `req.user` |
| `apps/client/src/components/auth/` | LoginForm, RegisterForm, etc. |
| `apps/client/src/routes/login.tsx` | Login page |
| `apps/client/src/routes/auth.callback.tsx` | OAuth callback |
| `apps/client/src/routes/auth.oauth.callback.tsx` | OAuth callback |
| `apps/client/src/routes/_dashboard/profile.tsx` | Profile page |

### Modify

**`apps/api/src/app/app.module.ts`** — strip import lines + array entries for `AuthModule`, `ProfileModule`, `AbilitiesModule`.

**`apps/client/src/routes/_dashboard.tsx`** — strip `beforeLoad` block and `useAuthStore`/`redirect` imports, leaving only the `MainLayout` / `Outlet` component.

**`apps/api/package.json`** — strip `@icore/auth-client` dep.

**`tsconfig.base.json`** — strip `@icore/auth-client` and `@icore/auth-strategies/*` path aliases (reuse existing `stripTsconfigPath`).

**`apps/api/.env`** — strip `AUTH_*` transport vars via existing `stripGatewayTransport(targetDir, 'AUTH')`.

**`docker-compose.yml`** — strip `auth:` service block and remove `auth:` from `gateway.depends_on`.

**`apps/api/src/app/gateway-services.ts`** — NOT patched by `removeAuthStack`. Instead, `writeFeaturesWiring` (in `manifest/wire-features.ts`) already regenerates this file and hardcodes `{ name: 'auth', prefix: 'AUTH' }` on every run. Fix: guard that line with `if (opts.authProvider !== 'none')`. This runs before `removeAuthStack` in `scaffold()`, so the file is already correct when auth=none and no further patching is needed.

### No-op / already correct

`pruneRootProviderDeps` — `'none'` doesn't match any SDK key, so all unchosen auth SDKs are pruned automatically. No change needed.

`rewriteRootPackageJson` MongoDB guard — `opts.authProvider === 'mongodb'` is false when auth=none; correct.

`removeFirebaseAdminLib` — called when no provider uses Firebase. With auth=none, this depends on upload/db choices; existing logic handles it correctly.

---

## `scaffold()` Changes (`lib/scaffold.ts`)

```ts
// Auth branch
if (opts.authProvider !== 'none') {
  await writeAuthEnv(opts.targetDir, opts);
}
...
await selectClientTemplate(opts.targetDir, opts);  // must run before removeAuthStack
...
if (opts.authProvider !== 'none') {
  await cleanupUnusedAuth(opts.targetDir, opts.authProvider as AuthBackend);
  await writeAuthProvider(opts.targetDir, opts.authProvider as AuthBackend);
} else {
  await removeAuthStack(opts.targetDir);
}
```

`writeAuthEnv` is also guarded because the auth `.env.example` file doesn't exist when auth=none is chosen at wizard time — actually it does exist in the copied template, but we skip writing the `.env` since the entire MS dir is deleted.

---

## Testing

| File | What to cover |
|------|--------------|
| `lib/__tests__/prompts.unit.test.ts` | `parseFlags` parses `--auth none`; `collectOptions` cascade: db='none', example='none', transport skipped when upload=none |
| `lib/__tests__/scaffold.unit.test.ts` | auth=none path: `removeAuthStack` called, `writeAuthProvider` not called |
| `lib/__tests__/scaffold-strip.unit.test.ts` | `removeAuthStack` deletes expected dirs, strips `app.module.ts` imports, strips `_dashboard.tsx` beforeLoad |
| `lib/__tests__/config.unit.test.ts` | `validateConfig` accepts `{ auth: 'none' }` |
| `manifest/__tests__/wire-auth.unit.test.ts` | Types accept `AuthBackend` (not `AuthProvider`) — no runtime change |

---

## Out of Scope

- Re-adding auth later via a generator (future work)
- `--minimal` preset flag (YAGNI)
- Stripping upload from docker-compose when upload=none (pre-existing gap, separate concern)

---

## Changeset

`minor` — new feature, no breaking change to existing auth flows.
