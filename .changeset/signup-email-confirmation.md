---
'@idevconn/create-icore': patch
---

Signup with Supabase "Confirm email" no longer 500s: gateway answers 202 confirmation_required, clients show the check-email screen, emails link to CLIENT_ORIGIN, unconfirmed login is a clear 403; CLI prints the Supabase/Firebase URL setup notice
