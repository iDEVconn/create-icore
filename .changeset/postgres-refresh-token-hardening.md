---
"@idevconn/create-icore": patch
---

Harden `PostgresAuthStrategy` refresh-token handling: tokens are now stored as a SHA-256 hash (never plaintext) in `_icore_sessions`, and replaying an already-rotated refresh token now revokes the entire session lineage (reuse detection) instead of just failing the single request. Note: this changes the `_icore_sessions` schema (`refresh_token` → `token_hash`, `family_id`, `revoked_at`) — existing deployments must drop/recreate the table or add these columns manually before upgrading, since this strategy has no formal migration tooling.
