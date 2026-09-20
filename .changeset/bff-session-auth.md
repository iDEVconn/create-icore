---
'@idevconn/create-icore': minor
---

Replaces the hybrid Bearer-access-token + httpOnly-refresh-cookie auth
model with a full BFF (Backend-For-Frontend) pattern: the browser now
holds only an opaque, httpOnly `icore_sid` session cookie. The gateway
resolves identity from a new Redis-backed `SessionStore`, transparently
refreshing the underlying provider (Supabase/Firebase/MongoDB/Postgres)
token pair server-side under a distributed lock. CSRF protection is now a
global guard covering every mutating route, not just `/auth/refresh`.
Requires a new `SESSION_REDIS_URL` env var on the gateway. Breaking change:
every existing session is invalidated on deploy (forced re-login).
