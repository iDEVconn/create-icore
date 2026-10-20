# Durable Object session store + throttler storage (PR 3 of the Workers phase)

**Goal:** `SessionStore` and Nest throttler storage that hold across Worker isolates.

**Spec:** `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md` (Sessions, Rate limiting).

**Ruling (deviates from the spec's delivery table):** no `@cloudflare/vitest-pool-workers`. The object logic is plain TypeScript
(`SessionObjectCore`, `ThrottleObjectCore` over a structural `DurableObjectStorageLike`) in `libs/shared/src/cloudflare/`, tested in
Node against an in-memory namespace that serializes calls per object like a real Durable Object. The thin `DurableObject` subclasses
(`extends DurableObject` from `cloudflare:workers`) belong to `apps/worker` (PR 5), where `wrangler dev` exercises them. Cost of being wrong:
real DO behaviours (input gates, alarm retries) are only covered by the PR 5 smoke and a future live check. Not live-tested on Cloudflare.

- `DurableObjectSessionStore(namespace)`: one object per user; id `base64url(uid).<256-bit random>`; GETDEL-style `delete`/`deleteAllForUser`;
  `update` false when gone and never changes identity fields; 30 s lease lock with polling (20 s max wait); idle TTL 30 d via alarm.
- `DurableObjectThrottlerStorage(namespace)`: one object per `<throttler>:<key>`, same counting rules as Nest's in-memory storage.
- Tests: shared `runSessionStoreContract`, routing/malformed ids, expiry + alarm, lock single-flight/timeout/stale-lease, throttle counting/blocking/concurrency.
