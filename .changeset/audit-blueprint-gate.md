---
'@idevconn/create-icore': minor
---

The scaffold smoke (`smoke-scaffold.mjs`, run on every PR via Layer A + nightly via the matrix) now runs `auditProject` right after generation: it reads the project's `blueprint.json`, derives the forbidden raw-SDK set (a provider's SDK is forbidden when that provider is unchosen), and fails the smoke if any package.json keeps one — plus the existing import-of-absent-@icore-lib check. A permanent orphan-regression gate.
