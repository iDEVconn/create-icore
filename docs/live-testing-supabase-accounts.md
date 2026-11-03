# Live-testing with real Supabase accounts (no email quota hit)

Supabase's free-tier email sender has a very low per-project rate limit — it
exhausts after a handful of sends in one session and doesn't visibly reset
for hours. This blocks any live 2-user (or fresh-signup) verification that
relies on magic-link / signup-confirmation emails. Use this instead: it
produces a real, usable browser session for any account without ever
sending an email.

## Log in to an existing account without email

```bash
set -a
source apps/microservices/auth/.env   # provides SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
set +a

curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/generate_link" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"someone@example.com"}'
```

The response's `action_link` is the same hosted verify URL Supabase would
otherwise have emailed. Follow its redirect to get a real session:

```bash
curl -sD - "$ACTION_LINK" -o /dev/null | grep -i '^location:'
```

The `Location` header already contains `#access_token=...&refresh_token=...`
in the URL fragment — that's a genuine, usable session for that account.

**`redirectTo` gotcha:** passing `"options":{"redirectTo":"http://localhost:4200/auth/callback"}`
in the request body only works if that exact URL is on Supabase's allowlisted
redirect URLs for the project. If it isn't, Supabase silently falls back to
the project's default Site URL root — no error, the path just gets dropped.
Don't fight the allowlist: the hash fragment is 100% client-side (never sent
to any server), so just prepend whatever path you actually want
(`/auth/callback`) onto the captured `Location` header's origin + fragment
yourself before navigating a browser there.

Then drive a browser (Playwright, etc.) straight to the reconstructed URL —
the app's own hash-fragment-session handling logs the user in for real, no
email round-trip involved.

## Minting a brand-new, pre-confirmed test account

When you need a fresh throwaway account instead of reusing an existing one:

```bash
curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-user@example.com","password":"...","email_confirm":true}'
```

`email_confirm: true` creates the account already confirmed — no
verification step needed, log in with the password directly.

## Notes

- Both calls use `SUPABASE_SERVICE_ROLE_KEY` against the real project — treat
  them as live-data actions. Source the key from an existing `.env` file at
  runtime; never hardcode or print it.
- Real magic-link/OTP delivery is still exactly what ships to production —
  this technique is for *test/verification sessions only*, not a reason to
  stop testing the real email flow occasionally.
