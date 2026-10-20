# Task 4 report: R2 storage lib

Status: DONE. Commit 42f123e `feat(storage-r2): R2 storage strategy`.

## Implemented
- Lib generated via `yarn nx g @nx/js:lib --directory=libs/storage-strategies/r2 --name=storage-r2 --importPath=@icore/storage-r2 --bundler=tsc --unitTestRunner=vitest --linter=eslint`, aligned to d1 (configs, package.json, project.json). Generator stubs/README removed. tsconfig.base.json alias added by generator.
- tsconfig.lib.json does NOT exclude `src/**/testing/**` (mock is exported from index like minio); build green.
- `r2-storage.strategy.ts` (R2ClientLike, R2StorageStrategy, TTL default 900 / clamp 604800, ownership prefix, no bucket creation, no MIME allowlist), `r2-s3-client.ts` (region auto, endpoint https://<acct>.r2.cloudflarestorage.com, paginated listKeys), `testing/mock-r2.ts`, `r2-storage.module.ts`, `index.ts`. Self-contained: no minio imports.

## AWS SDK versions
`@aws-sdk/client-s3` ^3.1153.0 and `@aws-sdk/s3-request-presigner` ^3.1153.0 (resolved 3.1153.0), in root package.json dependencies and lib package.json. yarn.lock committed; `yarn install --immutable` passes.

## TDD
RED: `yarn nx test storage-r2` -> "Test Files 4 failed (4), no tests" (modules missing).
GREEN: same command -> 4 files passed, 18 tests passed (contract 7, strategy 6, s3 client 3, module 2).
Gates: prettier on touched files, `yarn nx lint storage-r2` ok, `yarn nx build storage-r2` ok. tools/create-icore/templates not dirtied.

## Self-review / concerns
- S3 client tests stub `S3Client.prototype.send` with vi.spyOn (offline); presign test is real and offline.
- Extra tests beyond brief: ttl within limit untouched, foreign-user forbidden, user-id prefix collision (u1 vs u10), empty listing.
- Untracked docs/live-testing-supabase-accounts.md left untouched.

## Fix round 1
- getSignedUrl: non-finite/<=0 ttl throws `invalid_ttl`; floor, clamp to 604800; omitted = 900 (ttl flooring to <1 also invalid_ttl).
- upload: `/`, `\` and control chars in filename replaced with `_`.
- assertOwner: segments[0]===userId, >=2 segments, no empty/`.`/`..` segment, no backslash, else `forbidden`.
- Tests added in strategy.unit.test.ts for all listed cases. `yarn nx test storage-r2`: 4 files, 30 tests passed; lint and build green.
