---
"@idevconn/create-icore": patch
---

Implement AuthStrategy.revoke() for supabase and firebase (previously not_implemented stubs from PR3). Supabase: exchanges the refresh token via refreshSession() then calls admin.signOut(accessToken, 'local'), ending exactly that one session. Firebase: exchanges via identityToolkit.refresh() + verifyIdToken() to derive the uid, then calls adminAuth.revokeRefreshTokens(uid) — Firebase has no per-session revoke primitive, so this ends every session for that user (documented SDK limitation, covered by a dedicated contract-test variant rather than silently treated as equivalent to per-session revoke). The shared AuthStrategy contract gains a revokeIsUserWide flag so both revoke shapes are correctly tested.
