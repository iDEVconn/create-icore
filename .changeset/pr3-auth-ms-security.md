---
"@idevconn/create-icore": patch
---

Close two auth MS security gaps: add an opt-in HMAC transport guard (AUTH_TCP_SECRET) so the auth MS's TCP port rejects unsigned requests once configured, closing an admin-role-escalation hole where any process reaching the port could call auth.setRole directly; add AuthStrategy.revoke() (postgres/mongodb/fake implemented, supabase/firebase throw not_implemented pending their own session-tracking design) wired to a new POST /auth/logout route, so a leaked or stolen refresh token — or a shared-machine logout — can actually end that session instead of living until its natural 7-day expiry.
