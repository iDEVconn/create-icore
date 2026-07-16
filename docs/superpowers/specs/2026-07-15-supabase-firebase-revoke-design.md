# Supabase/Firebase `revoke()` Design

## Context

PR3 (`feature/auth-ms-hmac-and-revoke`, #241, merged) added `AuthStrategy.revoke(refreshToken): Promise<void>` and implemented it fully for `postgres`, `mongodb`, and `FakeAuthStrategy` (all three track sessions in their own table/map keyed by refresh token — a straightforward delete). `SupabaseAuthStrategy` and `FirebaseAuthStrategy` were left throwing `not_implemented`, documented as an explicit scope boundary: their SDKs don't expose "revoke by this refresh-token string" directly. This spec designs the real implementation for both.

## Verified API surface

- **Supabase** (`node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts:63`): `admin.signOut(jwt: string, scope?: SignOutScope): Promise<{...}>`, where `SignOutScope = 'global' | 'local' | 'others'` (`lib/types.d.ts:1665`). Takes an **access-token JWT**, not a refresh token. `scope: 'local'` ends only the session tied to that JWT — matches the interface's documented per-session revoke contract.
- **Firebase** (`node_modules/firebase-admin/lib/auth/base-auth.d.ts:321`): `adminAuth.revokeRefreshTokens(uid: string): Promise<void>`. Takes a **uid**, not a refresh token, and invalidates ALL of that user's sessions (bumps a `validSince` timestamp server-side) — there is no per-session revoke primitive in Firebase Admin SDK.

Neither SDK accepts a bare refresh-token string directly. Both need an intermediate step to derive the JWT/uid from the refresh token first.

## Design

**Supabase** — exchange then sign out, scoped to just this session:
```typescript
async revoke(refreshToken: string): Promise<void> {
  try {
    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return; // already invalid/expired — idempotent per interface contract
    await this.client.auth.admin.signOut(data.session.access_token, 'local');
  } catch {
    // idempotent: revoking an unknown/already-dead token is not an error
  }
}
```
`refreshSession` rotates the token as a side effect — acceptable, since revocation was going to kill this refresh token regardless. `scope: 'local'` ends only the session the exchange produced, not every session for that user.

**Firebase** — exchange then revoke all sessions for that uid (broader than one session, but Firebase has no narrower primitive):
```typescript
async revoke(refreshToken: string): Promise<void> {
  try {
    const res = await this.identityToolkit.refresh(refreshToken);
    const verified = await this.adminAuth.verifyIdToken(res.id_token);
    await this.adminAuth.revokeRefreshTokens(verified.uid);
  } catch {
    // idempotent: revoking an unknown/already-dead token is not an error
  }
}
```
Requires adding `revokeRefreshTokens(uid: string): Promise<void>` to the `FirebaseAdminAuthLike` interface (`firebase-auth.strategy.ts`), alongside `verifyIdToken`/`setCustomUserClaims`/`getUser`.

**Documented asymmetry:** Supabase revokes exactly the one session; Firebase revokes every session for that user. This is a real Firebase SDK limitation (no per-refresh-token revoke exists), not a design shortcut — call it out in the JSDoc on `FirebaseAuthStrategy.revoke()` so a future reader isn't surprised that a single logout ends all of a Firebase user's sessions.

**Idempotency:** both wrap the whole body in try/catch and swallow — matches the interface's stated contract ("revoking an already-invalid/unknown token is not an error") and mirrors how `postgres`/`mongodb`/`fake` already behave (a `DELETE ... WHERE` on a non-existent row is a silent no-op).

## Testing

Both strategies' contract-test call sites currently pass `supportsRevoke: false` (added in PR3) to skip the shared contract's full-semantics revoke tests. This spec flips both to `supportsRevoke: true`, so they now run the same 3 shared cases every other implementation runs (`revoke invalidates the refresh token`, `revoke does not affect other sessions`, `revoke is idempotent`) against real mock doubles (`createMockSupabaseClient`, the existing Firebase `IdentityToolkitClient`/`FirebaseAdminAuthLike` test doubles) — no bespoke test infrastructure needed, the shared contract already covers the behavior.

One nuance for Supabase's mock: `createMockSupabaseClient()` needs its `admin.signOut` and `auth.refreshSession` to actually track session state so the shared contract's "does not affect other sessions" case can tell two sessions apart — read the existing mock before extending it; add exactly what's missing rather than rewriting it.

## Scope

Auth-strategy libs only (`libs/auth-strategies/supabase`, `libs/auth-strategies/firebase`) plus `libs/shared`'s contract-test call sites. No gateway/MS changes — `auth.revoke`/`POST /auth/logout` are already wired generically from PR3.
