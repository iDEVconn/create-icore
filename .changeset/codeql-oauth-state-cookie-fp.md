---
'@idevconn/create-icore': patch
---

Suppresses a CodeQL false positive flagging the `oauth_state` cookie write in `oauthStart` as clear-text storage of sensitive data — it's an httpOnly, Secure (in prod), SameSite cookie, the correct OWASP-recommended pattern for a short-lived anti-CSRF nonce, not a vulnerability.
