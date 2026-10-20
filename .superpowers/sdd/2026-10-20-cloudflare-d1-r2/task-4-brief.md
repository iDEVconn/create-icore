### Task 4: R2 lib (strategy, S3 client, mock, module)

**Files:**

- Create (via generator): `libs/storage-strategies/r2/` (project `storage-r2`, alias `@icore/storage-r2`)
- Create: `src/lib/r2-storage.strategy.ts`, `src/lib/r2-s3-client.ts`, `src/lib/testing/mock-r2.ts`, `src/lib/r2-storage.module.ts`, `src/index.ts`
- Test: `src/lib/__tests__/r2-storage.contract.unit.test.ts`, `r2-s3-client.unit.test.ts`, `r2-storage.module.unit.test.ts`
- Modify: root `package.json` (add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` at the same version), `yarn.lock`

**Interfaces:**

- Produces:
  - `interface R2ClientLike { putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>; deleteObject(bucket: string, key: string): Promise<void>; presignGetObject(bucket: string, key: string, expiresInSec: number): Promise<string>; listKeys(bucket: string, prefix: string): Promise<string[]> }`
  - `class R2StorageStrategy implements StorageStrategy { constructor(opts: { client: R2ClientLike; bucket: string }) }` (paths `<userId>/<uuid>-<filename>`, foreign-user `remove`/`getSignedUrl` throw `forbidden`, default TTL 900, clamp 604800)
  - `function createR2S3Client(opts: { accountId: string; accessKeyId: string; secretAccessKey: string }): R2ClientLike`
  - `function createMockR2(): R2ClientLike` (in-memory, exported from `index.ts` like `createMockMinio`)
  - `const R2_STORAGE_REQUIRED_ENV: string[]` = `['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET']`; `class R2StorageModule { static forRoot(envPath: string): DynamicModule }` providing `'StorageStrategy'`.

- [ ] **Step 1: Generate the lib** as in Task 1 Step 1 (aligned to `libs/storage-strategies/minio`; deps `@icore/shared`, `@nestjs/common`, `@nestjs/config`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `tslib`). Add the two AWS packages to the root `package.json`, run `yarn install`.
- [ ] **Step 2: Write failing tests**: contract `runStorageContract('R2StorageStrategy', () => new R2StorageStrategy({ client: createMockR2(), bucket: 'icore-uploads' }))`; extra strategy tests `getSignedUrl clamps ttl above 604800`, `getSignedUrl default ttl is 900`, `list returns every key when the client reports more than one page` (mock returns 2500 keys); S3 client tests (offline): `presignGetObject targets <account>.r2.cloudflarestorage.com with X-Amz-Expires equal to the requested ttl`, `listKeys follows ContinuationToken until exhausted` (stub the SDK `send`); module tests as in Task 3 (`declares its required env`, `provides a real R2StorageStrategy when env present`).
- [ ] **Step 3: Run** `yarn nx test storage-r2` — FAIL. **Step 4: Implement** all files per Interfaces (region `auto`, `endpoint https://<accountId>.r2.cloudflarestorage.com`; `listKeys` paginates `ListObjectsV2`; module follows `minio-storage.module.ts`, service label `'upload MS'`, provider `'r2'`, fake `FakeStorageStrategy`). **Step 5: Run** — PASS.
- [ ] **Step 6: Quality gate** (`prettier`, `yarn nx lint storage-r2`, `yarn nx build storage-r2`). **Step 7: Commit** `feat(storage-r2): R2 storage strategy` including `yarn.lock`.

