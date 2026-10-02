---
'@idevconn/create-icore': minor
---

Forgot password for Supabase and Firebase: login-page link, in-app /reset-password, POST /auth/password/forgot (always 200) and /password/reset (ends all other sessions), new VITE_AUTH_HAS_PASSWORD_RESET flag; AuthStrategy gains requestPasswordReset/confirmPasswordReset (third-party implementers must add them)
