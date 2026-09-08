---
"@idevconn/create-icore": minor
---

`PostgresAuthStrategy` now hashes new passwords with argon2id instead of bcrypt (OWASP's current recommendation). Backward-compatible by design: existing bcrypt hashes (`$2a$`/`$2b$`/`$2y$` prefix) still verify — `signIn` picks bcrypt or argon2id based on the stored hash's format — and get lazily rewritten to argon2id in `_icore_users.password_hash` right after a successful bcrypt login. No forced password reset, no downtime, no separate migration job; a live deployment will hold a mix of both hash formats indefinitely, which is expected. P2 item #11 from the third-party iCore infrastructure audit.
