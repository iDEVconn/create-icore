# Task 2: Fix Review Finding — AUTH_TCP_SECRET Comment Clarity

## Issue
Three files contained misleading comments about `AUTH_TCP_SECRET` behavior in production:
- Claimed the secret is a "no-op when unset" — only true outside production
- In production, unset/empty secret causes 100% runtime traffic rejection, not a boot crash
- Did not clarify that the same secret MUST be set on both `apps/api/.env` and `apps/microservices/auth/.env`

## Changes Made

### 1. `apps/api/.env.example` (lines 9-13)
**Before:** 
```
# Optional TCP request signing — when set, the auth MS rejects any request that isn't
# HMAC-signed with the same secret. Must match apps/microservices/auth/.env.
# No-op (open, as before) when unset. Generate with:
```

**After:**
```
# Optional TCP request signing — when set, the auth MS rejects any request that isn't
# HMAC-signed with the same secret. IMPORTANT: Must match apps/microservices/auth/.env
# exactly — setting it on only one side breaks auth (client signs requests the guard can't
# verify, or vice versa).
# Outside production: safe no-op when unset/empty (unsigned traffic allowed, with a
# one-time warning logged). In production (NODE_ENV=production): unset/empty secret causes
# RUNTIME rejection of EVERY request to the auth MS (not a boot crash, but 100% traffic
# failure once requests arrive). The secret is effectively REQUIRED before deploying with
# NODE_ENV=production. Generate with:
```

### 2. `apps/microservices/auth/.env.example` (lines 13-17)
**Before:** 
```
# Optional TCP request signing — when set, this MS rejects any request that isn't
# HMAC-signed with the same secret. Must match apps/api/.env.
# No-op (open, as before) when unset. Generate with:
```

**After:**
```
# Optional TCP request signing — when set, this MS rejects any request that isn't
# HMAC-signed with the same secret. IMPORTANT: Must match apps/api/.env exactly — setting
# it on only one side breaks auth (client signs requests the guard can't verify, or vice versa).
# Outside production: safe no-op when unset/empty (unsigned traffic allowed, with a
# one-time warning logged). In production (NODE_ENV=production): unset/empty secret causes
# RUNTIME rejection of EVERY request to the auth MS (not a boot crash, but 100% traffic
# failure once requests arrive). The secret is effectively REQUIRED before deploying with
# NODE_ENV=production. Generate with:
```

### 3. `apps/microservices/auth/src/app/security/hmac.guard.ts` (lines 7-11)
**Before:**
```typescript
/**
 * Verifies the HMAC signature the gateway attaches to every TCP payload (see
 * AuthClientService.send). AUTH_TCP_SECRET missing crashes boot in production
 * (same missingEnv/formatEnvBanner convention as MS strategy factories); in
 * dev it prints one banner and lets requests through unsigned.
 */
```

**After:**
```typescript
/**
 * Verifies the HMAC signature the gateway attaches to every TCP payload (see
 * AuthClientService.send). In production (NODE_ENV=production), an unset/empty
 * AUTH_TCP_SECRET causes per-request rejection at runtime via canActivate,
 * resulting in 100% traffic failure (not a boot crash). Outside production,
 * it logs one warning and lets requests through unsigned.
 */
```

## Verification

### Prettier
```
npx prettier --write apps/api/.env.example apps/microservices/auth/.env.example apps/microservices/auth/src/app/security/hmac.guard.ts
→ All files formatted correctly
```

### Linting

```
yarn nx lint auth
→ NX Successfully ran target lint for project auth

yarn nx lint api
→ NX Successfully ran target lint for project api
✔ All files pass linting
```

## Commit
```
commit 7a8e203
docs(auth): clarify AUTH_TCP_SECRET production behavior in comments

Fix misleading documentation in .env.example files and hmac.guard.ts that
incorrectly claimed missing AUTH_TCP_SECRET is a "no-op" in production. The
actual behavior: outside production, it's safe (unsigned traffic allowed with
one-time warning); in production, unset/empty secret causes RUNTIME rejection
of EVERY request (100% traffic failure, though not a boot crash).

Also clarify that the same secret value MUST be set on BOTH apps/api/.env
and apps/microservices/auth/.env — setting it on only one side breaks auth.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## Summary
Documentation-only review finding fix. All comments now accurately describe AUTH_TCP_SECRET behavior across production and development environments. Linting and formatting verified.
