---
'@idevconn/create-icore': patch
---

Generated projects now build and run out of the box:

- `pmRun()` — npm needs the `run` prefix for custom scripts (`npm run dev`, not `npm dev`); yarn/pnpm don't. Fixes wrong run hints across all package-manager paths.
- Strategy pruning rewritten: auth/upload/notes modules use a uniform function-pair shape (`makeSupabaseAuth`/`makeFirebaseAuth`, `makeSupabase/Firebase/CloudinaryStorage`, `makeSupabaseDB`/`makeFirestoreDB`) and the pruner drops the unchosen factory functions + collapses the provider branch to a single `return make<Chosen>(cfg);`. Eliminates `TS2304: Cannot find name 'makeFirebaseStrategy' / admin / FirestoreDBStrategy` dangling references in scaffolded microservices.
- `.gitignore` shipped so git no longer stages `node_modules` / the vendored yarn binary for npm/pnpm projects.
- Microservices no longer crash on missing `.env` / infra: payment shows a boxed banner instead of throwing on absent PayPal creds, jobs survives a down Redis (ioredis `error` handler + retry), and the gateway no longer crashes on missing PAYMENT/NOTES transport env.
