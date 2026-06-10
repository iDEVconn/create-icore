---
'@idevconn/create-icore': minor
---

The scaffold smoke (`smoke-scaffold.mjs`, run on every PR via Layer A + nightly via the matrix) now runs `auditProject` right after generation: it reads the project's `blueprint.json`, derives the forbidden raw-SDK set (a provider's SDK is forbidden when that provider is unchosen), and fails the smoke if any package.json keeps one — plus the existing import-of-absent-@icore-lib check. A permanent orphan-regression gate.

The scaffold now also prunes the raw SDK of any unchosen provider from the generated **root** `package.json` via `pruneRootProviderDeps` (wired into `scaffold()` after the provider/feature cleanups, before `writeBlueprintJson`): `@supabase/supabase-js`, `cloudinary`, `mongoose`, and `firebase-admin` are each removed unless their provider appears in `{ authProvider, dbProvider, upload }`. This closes the orphan the new gate surfaced — e.g. a supabase-only or mongodb-only project no longer ships an unused `cloudinary`/`@supabase/supabase-js` at the root. Transport driver deps (nats/mqtt/amqplib/kafkajs) and `@nestjs/mongoose`/bcrypt/jsonwebtoken are left untouched.
