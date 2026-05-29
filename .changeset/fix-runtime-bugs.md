---
'@idevconn/create-icore': patch
---

fix: three runtime bugs in generated projects

1. node:crypto in browser — FakeAuthStrategy/FakeStorageStrategy now use
   globalThis.crypto.randomUUID() which works in both Node 20+ and browsers
2. Cryptic crash on empty env vars — MS factories now call requireEnv() which
   throws a human-readable error naming the .env file to fix
3. Unused strategy builds — scaffold now removes non-selected auth/storage/db
   strategy libs and strips their imports from MS modules (e.g. --auth=supabase
   removes libs/auth-strategies/firebase and firebase-admin import from auth MS)
