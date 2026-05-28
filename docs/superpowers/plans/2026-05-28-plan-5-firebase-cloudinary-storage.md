# Plan 5: Firebase + Cloudinary Storage Strategies

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two more concrete `StorageStrategy` implementations — Firebase (Cloud Storage via `firebase-admin`) and Cloudinary (REST via `cloudinary` Node SDK). Wire both into the upload MS factory so `STORAGE_PROVIDER=firebase` or `STORAGE_PROVIDER=cloudinary` swap the entire storage backend.

**Architecture:** Same pattern as Plan 2 (Firebase auth) and Plan 4 (Supabase storage). Each lib exposes a strategy that adapts the provider SDK to the icore `StorageStrategy` contract. Each ships an in-memory mock so contract tests run offline. Upload MS factory grows two more `case` branches.

**Tech Stack:** `firebase-admin` (^13, already installed in Plan 3), `cloudinary` (^2), Vitest 4.

**Source spec:** `docs/superpowers/specs/2026-05-28-icore-design.md`

**Branch:** `dev`. Plan 4 HEAD: `149bc93`.

**Generators only** — `nx g @nx/js:lib` for both new libs.

---

## File Map

| Path                                                                        | Purpose                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `libs/storage-strategies/firebase/`                                         | `FirebaseStorageStrategy` (generated via `@nx/js:lib`)             |
| `libs/storage-strategies/firebase/src/lib/firebase-storage.strategy.ts`     | implements `StorageStrategy` over a `FirebaseStorageBucketLike`    |
| `libs/storage-strategies/firebase/src/lib/testing/mock-firebase-storage.ts` | in-memory bucket double                                            |
| `libs/storage-strategies/cloudinary/`                                       | `CloudinaryStorageStrategy` (generated via `@nx/js:lib`)           |
| `libs/storage-strategies/cloudinary/src/lib/cloudinary-storage.strategy.ts` | implements `StorageStrategy` over a `CloudinaryApiLike`            |
| `libs/storage-strategies/cloudinary/src/lib/testing/mock-cloudinary.ts`     | in-memory Cloudinary API double                                    |
| `apps/microservices/upload/src/app/app.module.ts`                           | add `case 'firebase':` + `case 'cloudinary':` to the factory       |
| `apps/microservices/upload/package.json`                                    | declare both strategy libs + `firebase-admin` + `cloudinary`       |
| `apps/microservices/upload/.env.example`                                    | document `FB_ADMIN_*` + `FIREBASE_STORAGE_BUCKET` + `CLOUDINARY_*` |
| `docs/architecture.md`                                                      | flip Plan 5 to ✅                                                  |

---

## Task 1: `libs/storage-strategies/firebase`

**Goal:** Scaffold + implement `FirebaseStorageStrategy`. Passes the 7 `runStorageContract` cases against a mock bucket. Same `assertOwner` defense-in-depth as Plan 4's Supabase strategy.

### Steps

- [ ] **Step 1: Generate**

```bash
yarn nx g @nx/js:lib --name=storage-firebase --directory=libs/storage-strategies/firebase --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@icore/storage-firebase --no-interactive
```

- [ ] **Step 2: Delete placeholders + tsconfig.json module=node16**

Match `libs/storage-strategies/supabase/tsconfig.json` (Plan 4 T1). Three-level extends path. Drop generator placeholders. Set `passWithNoTests: true` in `vitest.config.mts`. Empty barrel.

- [ ] **Step 3: Declare deps**

Edit `libs/storage-strategies/firebase/package.json`:

```json
{
  "name": "@icore/storage-firebase",
  ...
  "dependencies": {
    "@icore/shared": "*",
    "tslib": "^2.3.0"
  },
  "devDependencies": {
    "vitest": "^4.0.0"
  }
}
```

We don't take a direct `firebase-admin` dep here — the strategy talks to a `FirebaseStorageBucketLike` interface (narrowed surface). The upload MS module wires the real `admin.storage().bucket(name)` at boot. Same trick Plan 3 used for the Firebase auth strategy.

- [ ] **Step 4: Write the mock bucket**

Create `libs/storage-strategies/firebase/src/lib/testing/mock-firebase-storage.ts`:

```ts
import type {
  FirebaseStorageBucketLike,
  FirebaseStorageFileLike,
} from '../firebase-storage.strategy';

interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

export function createMockFirebaseBucket(name = 'icore-uploads'): FirebaseStorageBucketLike {
  const objects = new Map<string, StoredObject>();

  function fileHandle(path: string): FirebaseStorageFileLike {
    return {
      async save(body, opts) {
        objects.set(path, {
          bytes: Buffer.from(body),
          contentType: opts?.metadata?.contentType ?? 'application/octet-stream',
        });
      },
      async delete() {
        if (!objects.has(path)) throw new Error('not_found');
        objects.delete(path);
      },
      async getSignedUrl(opts) {
        if (!objects.has(path)) throw new Error('not_found');
        return [`https://mock.firebasestorage/${name}/${path}?ttl=${opts.expires}`];
      },
    };
  }

  return {
    name,
    file: (path: string) => fileHandle(path),
    async getFiles(opts) {
      const matches = [...objects.keys()].filter((p) =>
        opts?.prefix ? p.startsWith(opts.prefix) : true,
      );
      return [matches.map((p) => ({ name: p }))];
    },
  };
}
```

- [ ] **Step 5: Write the failing contract test (RED)**

Create `libs/storage-strategies/firebase/src/lib/__tests__/firebase-storage.contract.unit.test.ts`:

```ts
import { runStorageContract } from '@icore/shared';
import { FirebaseStorageStrategy } from '../firebase-storage.strategy';
import { createMockFirebaseBucket } from '../testing/mock-firebase-storage';

runStorageContract('FirebaseStorageStrategy', () => {
  const bucket = createMockFirebaseBucket('icore-uploads');
  return new FirebaseStorageStrategy({ bucket });
});
```

Run `yarn nx test storage-firebase` — expect FAIL (module not found).

- [ ] **Step 6: Implement the strategy (GREEN)**

Create `libs/storage-strategies/firebase/src/lib/firebase-storage.strategy.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { FileInput, StorageRef, StorageStrategy } from '@icore/shared';

// Narrowed surfaces of firebase-admin's storage Bucket + File. The upload MS
// wires the real admin.storage().bucket(name); we only need these methods.

export interface FirebaseStorageFileLike {
  save(body: Buffer, opts?: { metadata?: { contentType?: string } }): Promise<void>;
  delete(): Promise<void>;
  getSignedUrl(opts: { action?: 'read'; expires: number }): Promise<[string]>;
}

export interface FirebaseStorageBucketLike {
  name: string;
  file(path: string): FirebaseStorageFileLike;
  getFiles(opts?: { prefix?: string }): Promise<[Array<{ name: string }>]>;
}

export interface FirebaseStorageStrategyOptions {
  bucket: FirebaseStorageBucketLike;
}

export class FirebaseStorageStrategy implements StorageStrategy {
  private readonly bucket: FirebaseStorageBucketLike;

  constructor(opts: FirebaseStorageStrategyOptions) {
    this.bucket = opts.bucket;
  }

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const path = `${userId}/${randomUUID()}-${file.filename}`;
    await this.bucket.file(path).save(file.buffer, {
      metadata: { contentType: file.mimeType },
    });
    return { bucket: this.bucket.name, path };
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    this.assertOwner(userId, ref);
    await this.bucket.file(ref.path).delete();
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    this.assertOwner(userId, ref);
    const [url] = await this.bucket.file(ref.path).getSignedUrl({
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
    });
    return url;
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const folder = prefix ? `${userId}/${prefix}` : userId;
    const [files] = await this.bucket.getFiles({ prefix: `${folder}/` });
    return files
      .filter((f) => f.name !== folder + '/')
      .map((f) => ({ bucket: this.bucket.name, path: f.name }));
  }

  private assertOwner(userId: string, ref: StorageRef): void {
    if (!ref.path.startsWith(`${userId}/`)) throw new Error('forbidden');
  }
}
```

Update barrel:

```ts
// libs/storage-strategies/firebase/src/index.ts
export * from './lib/firebase-storage.strategy';
export * from './lib/testing/mock-firebase-storage';
```

- [ ] **Step 7: Run + verify**

```bash
yarn nx test storage-firebase
yarn nx lint storage-firebase
yarn nx build storage-firebase
```

7 tests pass. Lint silent. Build green.

- [ ] **Step 8: Commit**

```bash
git add libs/storage-strategies/firebase package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(storage-firebase): implement FirebaseStorageStrategy, passes runStorageContract"
```

---

## Task 2: `libs/storage-strategies/cloudinary`

**Goal:** Same shape, for Cloudinary. Strategy uses a `CloudinaryApiLike` interface narrowed to the four ops we need; upload MS wires the real `cloudinary.v2` API at boot.

### Steps

- [ ] **Step 1: Generate**

```bash
yarn nx g @nx/js:lib --name=storage-cloudinary --directory=libs/storage-strategies/cloudinary --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@icore/storage-cloudinary --no-interactive
```

- [ ] **Step 2: tsconfig + placeholders + barrel**

Same pattern as Task 1 Step 2.

- [ ] **Step 3: Declare deps**

```json
"dependencies": {
  "@icore/shared": "*",
  "tslib": "^2.3.0"
},
"devDependencies": {
  "vitest": "^4.0.0"
}
```

- [ ] **Step 4: Mock**

Create `libs/storage-strategies/cloudinary/src/lib/testing/mock-cloudinary.ts`:

```ts
import type { CloudinaryApiLike, CloudinaryUploadResult } from '../cloudinary-storage.strategy';

interface StoredObject {
  bytes: Buffer;
  resourceType: 'image' | 'video' | 'raw';
}

export function createMockCloudinary(): CloudinaryApiLike {
  const objects = new Map<string, StoredObject>();

  return {
    async upload(buffer, opts) {
      const publicId = opts.public_id;
      if (objects.has(publicId)) throw new Error('exists');
      objects.set(publicId, { bytes: buffer, resourceType: opts.resource_type ?? 'raw' });
      return {
        public_id: publicId,
        secure_url: `https://mock.cloudinary/raw/${publicId}`,
      } satisfies CloudinaryUploadResult;
    },
    async destroy(publicId) {
      if (!objects.has(publicId)) throw new Error('not_found');
      objects.delete(publicId);
    },
    privateDownloadUrl(publicId, _format, opts) {
      if (!objects.has(publicId)) throw new Error('not_found');
      return `https://mock.cloudinary/signed/${publicId}?ttl=${opts?.expires_at ?? 'na'}`;
    },
    async resources(opts) {
      const matches = [...objects.keys()].filter((id) =>
        opts.prefix ? id.startsWith(opts.prefix) : true,
      );
      return { resources: matches.map((public_id) => ({ public_id })) };
    },
  };
}
```

- [ ] **Step 5: Failing test (RED)**

Create `libs/storage-strategies/cloudinary/src/lib/__tests__/cloudinary-storage.contract.unit.test.ts`:

```ts
import { runStorageContract } from '@icore/shared';
import { CloudinaryStorageStrategy } from '../cloudinary-storage.strategy';
import { createMockCloudinary } from '../testing/mock-cloudinary';

runStorageContract('CloudinaryStorageStrategy', () => {
  const api = createMockCloudinary();
  return new CloudinaryStorageStrategy({ api, bucket: 'icore-uploads' });
});
```

- [ ] **Step 6: Implement (GREEN)**

Create `libs/storage-strategies/cloudinary/src/lib/cloudinary-storage.strategy.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { FileInput, StorageRef, StorageStrategy } from '@icore/shared';

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
}

export interface CloudinaryApiLike {
  upload(
    buffer: Buffer,
    opts: { public_id: string; resource_type?: 'image' | 'video' | 'raw' },
  ): Promise<CloudinaryUploadResult>;
  destroy(publicId: string): Promise<void>;
  privateDownloadUrl(
    publicId: string,
    format: string | undefined,
    opts?: { expires_at?: number },
  ): string;
  resources(opts: { prefix?: string; type?: string }): Promise<{
    resources: Array<{ public_id: string }>;
  }>;
}

export interface CloudinaryStorageStrategyOptions {
  api: CloudinaryApiLike;
  bucket: string; // Cloudinary doesn't have buckets; we synthesize the ref.bucket field
}

export class CloudinaryStorageStrategy implements StorageStrategy {
  private readonly api: CloudinaryApiLike;
  private readonly bucket: string;

  constructor(opts: CloudinaryStorageStrategyOptions) {
    this.api = opts.api;
    this.bucket = opts.bucket;
  }

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const publicId = `${userId}/${randomUUID()}-${file.filename}`;
    const result = await this.api.upload(file.buffer, {
      public_id: publicId,
      resource_type: this.detectResourceType(file.mimeType),
    });
    return { bucket: this.bucket, path: result.public_id };
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    this.assertOwner(userId, ref);
    await this.api.destroy(ref.path);
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    this.assertOwner(userId, ref);
    return this.api.privateDownloadUrl(ref.path, undefined, {
      expires_at: Math.floor(Date.now() / 1000) + ttlSec,
    });
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const folder = prefix ? `${userId}/${prefix}` : userId;
    const { resources } = await this.api.resources({ prefix: `${folder}/` });
    return resources.map((r) => ({ bucket: this.bucket, path: r.public_id }));
  }

  private assertOwner(userId: string, ref: StorageRef): void {
    if (!ref.path.startsWith(`${userId}/`)) throw new Error('forbidden');
  }

  private detectResourceType(mimeType: string): 'image' | 'video' | 'raw' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'raw';
  }
}
```

Update barrel:

```ts
// libs/storage-strategies/cloudinary/src/index.ts
export * from './lib/cloudinary-storage.strategy';
export * from './lib/testing/mock-cloudinary';
```

- [ ] **Step 7: Run + verify**

```bash
yarn nx test storage-cloudinary
yarn nx lint storage-cloudinary
yarn nx build storage-cloudinary
```

7 tests pass.

- [ ] **Step 8: Commit**

```bash
git add libs/storage-strategies/cloudinary package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(storage-cloudinary): implement CloudinaryStorageStrategy, passes runStorageContract"
```

---

## Task 3: Wire firebase + cloudinary cases into upload MS factory

### Steps

- [ ] **Step 1: Install runtime SDKs**

```bash
yarn add cloudinary
```

(`firebase-admin@^13` already installed via Plan 3.)

- [ ] **Step 2: Add helper functions to the upload MS module**

Edit `apps/microservices/upload/src/app/app.module.ts`. Add two factory helpers and extend the switch:

```ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { SupabaseStorageStrategy } from '@icore/storage-supabase';
import { FirebaseStorageStrategy } from '@icore/storage-firebase';
import { CloudinaryStorageStrategy, type CloudinaryApiLike } from '@icore/storage-cloudinary';
import type { StorageStrategy } from '@icore/shared';
import { StorageController } from './storage.controller';

function makeFirebaseStorage(cfg: ConfigService): StorageStrategy {
  const bucketName = cfg.getOrThrow<string>('FIREBASE_STORAGE_BUCKET');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: cfg.getOrThrow<string>('FB_ADMIN_PROJECT_ID'),
        clientEmail: cfg.getOrThrow<string>('FB_ADMIN_CLIENT_EMAIL'),
        privateKey: cfg.getOrThrow<string>('FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  }
  return new FirebaseStorageStrategy({ bucket: admin.storage().bucket(bucketName) });
}

function makeCloudinaryStorage(cfg: ConfigService): StorageStrategy {
  cloudinary.config({
    cloud_name: cfg.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
    api_key: cfg.getOrThrow<string>('CLOUDINARY_API_KEY'),
    api_secret: cfg.getOrThrow<string>('CLOUDINARY_API_SECRET'),
    secure: true,
  });

  const api: CloudinaryApiLike = {
    async upload(buffer, opts) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { public_id: opts.public_id, resource_type: opts.resource_type ?? 'raw' },
          (error, result) => {
            if (error || !result) reject(error ?? new Error('upload_failed'));
            else resolve({ public_id: result.public_id, secure_url: result.secure_url });
          },
        );
        stream.end(buffer);
      });
    },
    async destroy(publicId) {
      await cloudinary.uploader.destroy(publicId);
    },
    privateDownloadUrl(publicId, format, opts) {
      return cloudinary.utils.private_download_url(publicId, format ?? '', opts);
    },
    async resources(opts) {
      const res = await cloudinary.api.resources({
        prefix: opts.prefix,
        type: opts.type ?? 'upload',
      });
      return {
        resources: (res.resources ?? []).map((r) => ({ public_id: r.public_id })),
      };
    },
  };

  return new CloudinaryStorageStrategy({
    api,
    bucket: cfg.get<string>('CLOUDINARY_BUCKET_TAG') ?? 'cloudinary',
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/upload/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [StorageController],
  providers: [
    {
      provide: 'StorageStrategy',
      useFactory: (cfg: ConfigService): StorageStrategy => {
        const provider = cfg.getOrThrow<string>('STORAGE_PROVIDER');
        switch (provider) {
          case 'supabase': {
            const client = createClient(
              cfg.getOrThrow<string>('SUPABASE_URL'),
              cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
              { auth: { autoRefreshToken: false, persistSession: false } },
            );
            return new SupabaseStorageStrategy({
              client,
              bucket: cfg.getOrThrow<string>('SUPABASE_STORAGE_BUCKET'),
            });
          }
          case 'firebase':
            return makeFirebaseStorage(cfg);
          case 'cloudinary':
            return makeCloudinaryStorage(cfg);
          default:
            throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Update package.json deps**

Add to `apps/microservices/upload/package.json` `dependencies`:

```json
"@icore/storage-firebase": "*",
"@icore/storage-cloudinary": "*",
"firebase-admin": "^13.0.0",
"cloudinary": "^2.0.0"
```

- [ ] **Step 4: Update `.env.example`**

Append to `apps/microservices/upload/.env.example`:

```
# --- Firebase Cloud Storage credentials (when STORAGE_PROVIDER=firebase) ---
FB_ADMIN_TYPE=service_account
FB_ADMIN_PROJECT_ID=<your-project-id>
FB_ADMIN_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
FB_ADMIN_CLIENT_EMAIL=firebase-adminsdk-<hash>@<project-id>.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=<project-id>.appspot.com

# --- Cloudinary credentials (when STORAGE_PROVIDER=cloudinary) ---
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>
# Synthetic StorageRef.bucket value (Cloudinary has no buckets). Optional, defaults to "cloudinary".
# CLOUDINARY_BUCKET_TAG=icore-uploads
```

- [ ] **Step 5: Verify the MS builds with all three providers compiled in**

```bash
yarn nx test upload
yarn nx lint upload
yarn nx build upload
```

`test upload` keeps the 5 controller tests (they use `FakeStorageStrategy`). Lint silent. Build green.

- [ ] **Step 6: Commit**

```bash
git add apps/microservices/upload package.json yarn.lock
git commit -m "feat(upload-ms): wire 'firebase' + 'cloudinary' cases into StorageStrategy factory"
```

---

## Task 4: Update architecture doc

- [ ] **Step 1: Flip Plan 5 row to ✅ in `docs/architecture.md` Status table.**

- [ ] **Step 2: Add Plan 5 deliverables section** after Plan 4's:

```markdown
## Plan 5 deliverables (active)

- `libs/storage-strategies/firebase` — `FirebaseStorageStrategy` over `firebase-admin`'s `bucket(name).file(path).{save,delete,getSignedUrl}` surface, plus `bucket.getFiles({prefix})`. Same 7 contract cases pass with a mocked bucket.
- `libs/storage-strategies/cloudinary` — `CloudinaryStorageStrategy` over a `CloudinaryApiLike` interface mapping `upload_stream` / `destroy` / `private_download_url` / `api.resources`. Cloudinary has no buckets, so the strategy synthesises `StorageRef.bucket` from the optional `CLOUDINARY_BUCKET_TAG` env (default `'cloudinary'`).
- Upload MS factory now handles all three providers — flipping `STORAGE_PROVIDER` switches the entire backend; the gateway is unaware.
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: mark Plan 5 done, document Firebase + Cloudinary storage strategies"
```

---

## Task 5: Final verify

- [ ] **Step 1: Full sweep**

```bash
yarn nx run-many -t lint test build
yarn format:check
```

Expected total: 87 (Plan 4) + 7 (storage-firebase) + 7 (storage-cloudinary) = **101 tests**, all green. 14 projects (was 12 + 2 new strategy libs).

If format drift, run `yarn format` and commit.

---

## Self-Review Notes

**Spec coverage (Plan 1 spec Phase 6):**

- Firebase storage strategy passing `runStorageContract` → Task 1 ✅
- Cloudinary storage strategy passing `runStorageContract` → Task 2 ✅
- Upload MS factory routes between three providers → Task 3 ✅
- `.env.example` documents all three credential blocks → Task 3 ✅
- Docs updated → Task 4 ✅

**Type consistency:**

- `StorageStrategy`, `StorageRef`, `FileInput` reused identically across Supabase, Firebase, Cloudinary strategies.
- Each strategy implements `assertOwner` privately — defense-in-depth alongside the gateway's `assertOwnership`.
- Mock factories follow the same naming pattern: `createMockFirebaseBucket`, `createMockCloudinary` — exported from each lib's barrel so future controller integration tests can wire real strategy stacks against in-memory backends.

**Deliberately deferred:**

- CI matrix (`STORAGE_PROVIDER=[supabase,firebase,cloudinary]` × auth matrix) — Plan 7 ships with the CLI; CI lives in the consumer project, not in `create-icore` itself except for the lint/test/build sweep.
- Real E2E tests against actual Firebase / Cloudinary projects — optional CI job once a test project is provisioned.
- Cloudinary streaming uploads from gateway (we already buffer for Supabase parity) — out of scope for v0.1.0.
- Cloudinary signed-URL TTL precision: the SDK takes `expires_at` as a UNIX timestamp; ours converts `ttlSec` to absolute time. Strategy contract test only checks "non-empty string", which is enough for v0.1.0.

**Out of scope:**

- Bucket / cloud auto-creation. All three providers require the storage location to exist before MS boot.
- CDN integration.
- Image / video transcoding.
