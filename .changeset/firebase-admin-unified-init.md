---
'@idevconn/create-icore': patch
---

Unify Firebase Admin initialization and consume the full service-account env contract.

- New `@icore/firebase-admin` lib exports a single `getFirebaseAdmin(cfg)` that initialises the default Admin app exactly once (guarded on `admin.apps`) and feeds the **complete** `FB_ADMIN_*` service-account JSON to `cert()` — the full set Firebase emits in its console config, not just project_id/client_email/private_key.
- The auth, upload (Firebase storage) and notes (Firestore) microservices now call `getFirebaseAdmin(cfg)` instead of each duplicating an `initializeApp({ credential: cert(...) })` block — one init, no drift.
- `REQUIRED_ENV` for every Firebase consumer now lists all 11 `FB_ADMIN_*` keys (shared `FIREBASE_ADMIN_REQUIRED_ENV`), so a missing field surfaces the boxed banner instead of a partial credential.
- Scaffold prunes `libs/firebase-admin` (and its alias/deps) when no provider uses Firebase, and strips the `@icore/firebase-admin` import + `firebase`/`firestore` REQUIRED_ENV entries from each microservice that doesn't.
