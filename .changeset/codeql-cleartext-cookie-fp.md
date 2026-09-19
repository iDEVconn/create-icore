---
'@idevconn/create-icore': patch
---

Suppress a CodeQL false positive (`js/clear-text-storage-of-sensitive-data`) on the httpOnly refresh-cookie write in `libs/shared/src/http/auth-cookies.ts` — the rule doesn't account for `httpOnly`/`Secure`/`SameSite` cookie attributes, which is the actual (OWASP-recommended) protection this code already applies.
