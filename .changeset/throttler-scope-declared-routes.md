---
'@idevconn/create-icore': patch
---

Fix the gateway rate limiter: the named throttlers `auth-burst` and `ai-burst` (10 requests a minute) applied to every route, so profile, notes and storage were limited too. They now count only the routes that declare `@Throttle` for their name.
