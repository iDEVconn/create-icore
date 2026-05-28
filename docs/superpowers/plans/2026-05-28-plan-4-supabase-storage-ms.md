# Plan 4: Supabase Storage MS + Gateway Storage Routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror Plan 2 (auth) for storage. Stand up the upload microservice (`apps/microservices/upload`), wire `SupabaseStorageStrategy` (`libs/storage-strategies/supabase`) on top of `@supabase/supabase-js`, connect it via the configurable transport, expose `POST /api/storage/upload`, `GET /api/storage/signed-url`, `DELETE /api/storage/remove`, and `GET /api/storage/list` on the gateway. After this plan, an authenticated user can upload a file and retrieve a signed URL end-to-end.

**Architecture:** Same shape as Plan 2. Gateway exposes HTTP, marshals to upload MS over TCP (default) via `libs/upload-client`. Upload MS hosts `@MessagePattern` handlers backed by a `StorageStrategy` factory provider. Gateway enforces ownership at the route boundary (`assertOwnership(ref, req.user.id)`); the MS additionally re-checks inside each strategy method so the contract holds even with a misconfigured gateway.

**Tech Stack:** NestJS 11, `@nestjs/microservices`, `@nestjs/platform-express` (for `FileInterceptor` / multer), `@nestjs/swagger`, `@supabase/supabase-js` (already installed via Plan 2).

**Source spec:** `docs/superpowers/specs/2026-05-28-icore-design.md`

**Branch:** `dev`. Plan 3 HEAD: `3755f67`.

**Generators only** — every project goes through `nx g`. Hand-rolled `project.json` forbidden.

---

## File Map

| Path                                                                                  | Purpose                                                              |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/microservices/upload/`                                                          | NestJS MS (generated via `@nx/nest:app`)                             |
| `apps/microservices/upload/src/main.ts`                                                | `createMicroservice(buildTransportMS('UPLOAD'))`                     |
| `apps/microservices/upload/src/app/app.module.ts`                                      | `ConfigModule.forRoot` + factory provider for `StorageStrategy`      |
| `apps/microservices/upload/src/app/storage.controller.ts`                              | `@MessagePattern('storage.upload' \| 'storage.remove' \| 'storage.signedUrl' \| 'storage.list')` |
| `apps/microservices/upload/.env.example`                                               | `UPLOAD_TRANSPORT`, `UPLOAD_HOST`, `UPLOAD_PORT`, `STORAGE_PROVIDER`, `SUPABASE_*` |
| `libs/storage-strategies/supabase/`                                                    | concrete `SupabaseStorageStrategy` (generated via `@nx/js:lib`)      |
| `libs/storage-strategies/supabase/src/lib/supabase-storage.strategy.ts`                | `SupabaseStorageStrategy implements StorageStrategy`                 |
| `libs/storage-strategies/supabase/src/lib/testing/mock-supabase-storage.ts`            | in-memory `SupabaseClient.storage` mock                              |
| `libs/storage-strategies/supabase/src/lib/__tests__/supabase-storage.contract.unit.test.ts` | invokes `runStorageContract`                                    |
| `libs/upload-client/`                                                                  | gateway → upload MS NestJS module (generated via `@nx/js:lib`)       |
| `libs/upload-client/src/lib/upload-client.module.ts`                                   | `ClientsModule.registerAsync` using `buildTransport('UPLOAD')`       |
| `libs/upload-client/src/lib/upload-client.service.ts`                                  | typed wrappers around `client.send('storage.*', ...)`                |
| `apps/api/src/app/storage/storage.module.ts`                                           | gateway-side storage module (controller + UploadClientModule)        |
| `apps/api/src/app/storage/storage.controller.ts`                                       | `POST /api/storage/upload` + GET/DELETE/list                         |
| `apps/api/src/app/storage/assert-ownership.ts`                                         | `assertOwnership(ref, userId)` helper                                |
| `apps/api/.env.example`                                                                | add `UPLOAD_TRANSPORT`, `UPLOAD_HOST`, `UPLOAD_PORT`, `MAX_FILE_SIZE_KB` |
| `docs/architecture.md`                                                                 | flip Plan 4 to ✅, add storage routes table + env entries            |

---

## Task 1: Generate `libs/storage-strategies/supabase`

- [ ] **Step 1: Generate**

```bash
cd /home/vladimir-tkach/Projects/icore
yarn nx g @nx/js:lib --name=storage-supabase --directory=libs/storage-strategies/supabase --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@icore/storage-supabase --no-interactive
```

- [ ] **Step 2: Delete placeholders + set tsconfig.json module=node16**

Same pattern as `libs/auth-strategies/supabase/tsconfig.json` (Plan 2 T3). Three-level extends path `../../../tsconfig.base.json`. Add `passWithNoTests: true` to `vitest.config.mts`.

Replace barrel with `export {};`.

- [ ] **Step 3: Verify**

```bash
yarn nx lint storage-supabase
yarn nx test storage-supabase
yarn nx build storage-supabase
```

All green.

- [ ] **Step 4: Commit**

```bash
git add libs/storage-strategies/supabase package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(storage-supabase): scaffold libs/storage-strategies/supabase via @nx/js:lib"
```

---

## Task 2: Implement `SupabaseStorageStrategy` (TDD)

- [ ] **Step 1: Declare deps**

The lib needs `@icore/shared`, `@supabase/supabase-js` (already installed at root in Plan 2), `tslib`, plus `vitest` dev. Edit `libs/storage-strategies/supabase/package.json`:

```json
"dependencies": {
  "@icore/shared": "*",
  "@supabase/supabase-js": "^2.0.0",
  "tslib": "^2.3.0"
},
"devDependencies": {
  "vitest": "^4.0.0"
}
```

- [ ] **Step 2: Write the mock storage client**

Create `libs/storage-strategies/supabase/src/lib/testing/mock-supabase-storage.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

interface StoredObject {
  bytes: Buffer;
  mimeType: string;
}

interface MockBucketHandle {
  upload(path: string, body: Buffer, opts?: { contentType?: string }): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
  createSignedUrl(path: string, ttlSec: number): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  list(prefix?: string): Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
}

export function createMockSupabaseStorageClient(bucket = 'icore-uploads'): SupabaseClient {
  const objects = new Map<string, StoredObject>();

  function ensureBucket(name: string): MockBucketHandle {
    if (name !== bucket) {
      // Most tests use the default bucket; surface mismatches clearly
      return {
        async upload() { return { data: null, error: { message: `unknown_bucket:${name}` } }; },
        async remove() { return { data: null, error: { message: `unknown_bucket:${name}` } }; },
        async createSignedUrl() { return { data: null, error: { message: `unknown_bucket:${name}` } }; },
        async list() { return { data: null, error: { message: `unknown_bucket:${name}` } }; },
      };
    }
    return {
      async upload(path, body, opts) {
        if (objects.has(path)) return { data: null, error: { message: 'duplicate' } };
        objects.set(path, { bytes: body, mimeType: opts?.contentType ?? 'application/octet-stream' });
        return { data: { path }, error: null };
      },
      async remove(paths) {
        for (const p of paths) objects.delete(p);
        return { data: null, error: null };
      },
      async createSignedUrl(path, ttlSec) {
        if (!objects.has(path)) return { data: null, error: { message: 'not_found' } };
        return { data: { signedUrl: `https://mock.supabase/${path}?ttl=${ttlSec}` }, error: null };
      },
      async list(prefix) {
        const matches = [...objects.keys()]
          .filter((p) => (prefix ? p.startsWith(prefix) : true))
          .map((name) => ({ name: name.split('/').pop() ?? name }));
        return { data: matches, error: null };
      },
    };
  }

  const storage = {
    from: (name: string) => ensureBucket(name),
  };

  return { storage } as unknown as SupabaseClient;
}
```

- [ ] **Step 3: Write the failing contract test (RED)**

Create `libs/storage-strategies/supabase/src/lib/__tests__/supabase-storage.contract.unit.test.ts`:

```ts
import { runStorageContract } from '@icore/shared';
import { SupabaseStorageStrategy } from '../supabase-storage.strategy';
import { createMockSupabaseStorageClient } from '../testing/mock-supabase-storage';

runStorageContract('SupabaseStorageStrategy', () => {
  const client = createMockSupabaseStorageClient('icore-uploads');
  return new SupabaseStorageStrategy({ client, bucket: 'icore-uploads' });
});
```

Run `yarn nx test storage-supabase` — expect FAIL (module not found).

- [ ] **Step 4: Implement the strategy (GREEN)**

Create `libs/storage-strategies/supabase/src/lib/supabase-storage.strategy.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FileInput, StorageRef, StorageStrategy } from '@icore/shared';

export interface SupabaseStorageStrategyOptions {
  client: SupabaseClient;
  bucket: string;
}

export class SupabaseStorageStrategy implements StorageStrategy {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(opts: SupabaseStorageStrategyOptions) {
    this.client = opts.client;
    this.bucket = opts.bucket;
  }

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const path = `${userId}/${randomUUID()}-${file.filename}`;
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, file.buffer, { contentType: file.mimeType });
    if (error) throw new Error(error.message);
    return { bucket: this.bucket, path };
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    this.assertOwner(userId, ref);
    const { error } = await this.client.storage.from(ref.bucket).remove([ref.path]);
    if (error) throw new Error(error.message);
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    this.assertOwner(userId, ref);
    const { data, error } = await this.client.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, ttlSec);
    if (error || !data) throw new Error(error?.message ?? 'signed_url_failed');
    return data.signedUrl;
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const folder = prefix ? `${userId}/${prefix}` : userId;
    const { data, error } = await this.client.storage.from(this.bucket).list(folder);
    if (error || !data) return [];
    return data.map((row) => ({ bucket: this.bucket, path: `${folder}/${row.name}` }));
  }

  private assertOwner(userId: string, ref: StorageRef): void {
    if (!ref.path.startsWith(`${userId}/`)) throw new Error('forbidden');
  }
}
```

Update barrel `libs/storage-strategies/supabase/src/index.ts`:

```ts
export * from './lib/supabase-storage.strategy';
export * from './lib/testing/mock-supabase-storage';
```

- [ ] **Step 5: Run — expect pass**

```bash
yarn nx test storage-supabase
```

Expected: 7 contract tests pass (upload prefix, list per-user, list isolation, signed URL, remove, foreign signed-url throws, foreign remove throws).

- [ ] **Step 6: Lint + build**

```bash
yarn nx lint storage-supabase
yarn nx build storage-supabase
```

Both green.

- [ ] **Step 7: Commit**

```bash
git add libs/storage-strategies/supabase package.json yarn.lock
git commit -m "feat(storage-supabase): implement SupabaseStorageStrategy, passes runStorageContract"
```

---

## Task 3: Generate `apps/microservices/upload`

- [ ] **Step 1: Generate**

```bash
yarn nx g @nx/nest:app --name=upload --directory=apps/microservices/upload --no-interactive
```

- [ ] **Step 2: Rewrite main.ts as MS bootstrap**

Replace `apps/microservices/upload/src/main.ts`:

```ts
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    buildTransportMS('UPLOAD'),
  );
  await app.listen();
}

bootstrap()
  .then(() => {
    const logger = new Logger('Upload-Bootstrap');
    logger.log(
      `Upload MS Bootstrap completed: transport=${process.env.UPLOAD_TRANSPORT ?? 'tcp'} host=${process.env.UPLOAD_HOST ?? '127.0.0.1'} port=${process.env.UPLOAD_PORT ?? '4002'}`,
    );
  })
  .catch((err) => {
    new Logger('Upload-Bootstrap').error(
      'Upload MS bootstrap failed',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  });
```

- [ ] **Step 3: Set tsconfig.app.json module=node16**

Same as auth MS — `module: node16, moduleResolution: node16, target: es2021, experimentalDecorators: true, emitDecoratorMetadata: true`. Remove any `paths` overrides emitted by the generator.

- [ ] **Step 4: Empty AppModule placeholder**

```ts
// apps/microservices/upload/src/app/app.module.ts
import { Module } from '@nestjs/common';

@Module({})
export class AppModule {}
```

Delete generator's `app.controller.ts` + `app.service.ts` + specs.

- [ ] **Step 5: Verify scaffold**

```bash
yarn nx build upload
yarn nx lint upload
```

Both green.

- [ ] **Step 6: Commit**

```bash
git add apps/microservices/upload apps/microservices/upload-e2e package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(upload-ms): scaffold upload microservice via @nx/nest:app"
```

---

## Task 4: Upload MS module + controller

- [ ] **Step 1: Write the controller**

Create `apps/microservices/upload/src/app/storage.controller.ts`:

```ts
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { StorageRef, StorageStrategy } from '@icore/shared';

interface UploadPayload {
  userId: string;
  file: { buffer: string; filename: string; mimeType: string }; // buffer base64 over wire
}

interface RefPayload {
  userId: string;
  ref: StorageRef;
}

interface SignedUrlPayload extends RefPayload {
  ttlSec?: number;
}

interface ListPayload {
  userId: string;
  prefix?: string;
}

@Controller()
export class StorageController {
  constructor(@Inject('StorageStrategy') private readonly strategy: StorageStrategy) {}

  @MessagePattern('storage.upload')
  upload(@Payload() payload: UploadPayload): Promise<StorageRef> {
    return this.strategy.upload(payload.userId, {
      buffer: Buffer.from(payload.file.buffer, 'base64'),
      filename: payload.file.filename,
      mimeType: payload.file.mimeType,
    });
  }

  @MessagePattern('storage.remove')
  remove(@Payload() payload: RefPayload): Promise<void> {
    return this.strategy.remove(payload.userId, payload.ref);
  }

  @MessagePattern('storage.signedUrl')
  signedUrl(@Payload() payload: SignedUrlPayload): Promise<string> {
    return this.strategy.getSignedUrl(payload.userId, payload.ref, payload.ttlSec);
  }

  @MessagePattern('storage.list')
  list(@Payload() payload: ListPayload): Promise<StorageRef[]> {
    return this.strategy.list(payload.userId, payload.prefix);
  }
}
```

Buffer payloads cross the TCP transport as base64 strings — NestJS's default TCP serializer is JSON-based, so binary needs encoding. The gateway encodes before sending; this controller decodes on entry.

- [ ] **Step 2: Write the module**

```ts
// apps/microservices/upload/src/app/app.module.ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseStorageStrategy } from '@icore/storage-supabase';
import type { StorageStrategy } from '@icore/shared';
import { StorageController } from './storage.controller';

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

Plan 5 adds `firebase` + `cloudinary` cases here.

- [ ] **Step 3: Update upload MS package.json deps**

```json
"dependencies": {
  "@icore/shared": "*",
  "@icore/storage-supabase": "*",
  "@nestjs/common": "...",
  "@nestjs/config": "...",
  "@nestjs/core": "...",
  "@nestjs/microservices": "...",
  "@supabase/supabase-js": "...",
  "reflect-metadata": "...",
  "rxjs": "...",
  "tslib": "..."
}
```

Use the versions from yarn.lock.

- [ ] **Step 4: Controller unit tests**

Create `apps/microservices/upload/src/app/__tests__/storage.controller.unit.test.ts`. Use `FakeStorageStrategy` from `@icore/shared`:

```ts
import { describe, expect, it } from 'vitest';
import { FakeStorageStrategy } from '@icore/shared';
import { StorageController } from '../storage.controller';

const fixture = () => {
  const strategy = new FakeStorageStrategy();
  return { strategy, controller: new StorageController(strategy) };
};

describe('StorageController', () => {
  const file = (filename = 'hello.txt') => ({
    buffer: Buffer.from('hello world').toString('base64'),
    filename,
    mimeType: 'text/plain',
  });

  it('upload returns a StorageRef under the user prefix', async () => {
    const { controller } = fixture();
    const ref = await controller.upload({ userId: 'user-1', file: file() });
    expect(ref.path.startsWith('user-1/')).toBe(true);
  });

  it('list returns previously uploaded files for the same user', async () => {
    const { controller } = fixture();
    await controller.upload({ userId: 'user-2', file: file() });
    const refs = await controller.list({ userId: 'user-2' });
    expect(refs.length).toBe(1);
  });

  it('signedUrl returns a non-empty string', async () => {
    const { controller } = fixture();
    const ref = await controller.upload({ userId: 'user-3', file: file() });
    const url = await controller.signedUrl({ userId: 'user-3', ref, ttlSec: 60 });
    expect(url.length).toBeGreaterThan(0);
  });

  it('remove deletes the file', async () => {
    const { controller } = fixture();
    const ref = await controller.upload({ userId: 'user-4', file: file() });
    await controller.remove({ userId: 'user-4', ref });
    expect(await controller.list({ userId: 'user-4' })).toEqual([]);
  });

  it('signedUrl for a foreign user throws', async () => {
    const { controller } = fixture();
    const ref = await controller.upload({ userId: 'owner', file: file() });
    await expect(controller.signedUrl({ userId: 'attacker', ref })).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Verify**

```bash
yarn nx test upload
yarn nx lint upload
yarn nx build upload
```

All green. 5 tests pass.

- [ ] **Step 6: Write `.env.example`**

Create `apps/microservices/upload/.env.example`:

```
# Transport (gateway ↔ this MS) — TCP by default; flip to redis or nats in prod
UPLOAD_TRANSPORT=tcp
UPLOAD_HOST=127.0.0.1
UPLOAD_PORT=4002
# UPLOAD_REDIS_URL=redis://localhost:6379
# UPLOAD_NATS_URL=nats://localhost:4222

# Which concrete StorageStrategy to instantiate
STORAGE_PROVIDER=supabase
# STORAGE_PROVIDER=firebase
# STORAGE_PROVIDER=cloudinary

# --- Supabase credentials (when STORAGE_PROVIDER=supabase) ---
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=icore-uploads
```

Firebase + Cloudinary blocks are added by Plan 5.

- [ ] **Step 7: Commit**

```bash
git add apps/microservices/upload package.json yarn.lock
git commit -m "feat(upload-ms): wire StorageStrategy factory + @MessagePattern handlers"
```

---

## Task 5: Generate `libs/upload-client`

Mirrors `libs/auth-client` (Plan 2 T6).

- [ ] **Step 1: Generate**

```bash
yarn nx g @nx/js:lib --name=upload-client --directory=libs/upload-client --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@icore/upload-client --no-interactive
```

- [ ] **Step 2: Delete placeholders + tsconfig.json module=node16 + experimentalDecorators**

Same pattern as `libs/auth-client/tsconfig.lib.json` (Plan 2 T6).

- [ ] **Step 3: Module + service**

`libs/upload-client/src/lib/upload-client.module.ts`:

```ts
import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { UploadClientService } from './upload-client.service';

export const UPLOAD_CLIENT = 'UPLOAD_CLIENT';

@Module({})
export class UploadClientModule {
  static forRoot(): DynamicModule {
    return {
      module: UploadClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: UPLOAD_CLIENT,
            useFactory: () => buildTransport('UPLOAD'),
          },
        ]),
      ],
      providers: [UploadClientService],
      exports: [UploadClientService],
    };
  }
}
```

`libs/upload-client/src/lib/upload-client.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { StorageRef } from '@icore/shared';
import { UPLOAD_CLIENT } from './upload-client.module';

@Injectable()
export class UploadClientService {
  constructor(@Inject(UPLOAD_CLIENT) private readonly client: ClientProxy) {}

  upload(
    userId: string,
    file: { buffer: Buffer; filename: string; mimeType: string },
  ): Promise<StorageRef> {
    return firstValueFrom(
      this.client.send<StorageRef>('storage.upload', {
        userId,
        file: {
          buffer: file.buffer.toString('base64'),
          filename: file.filename,
          mimeType: file.mimeType,
        },
      }),
    );
  }

  remove(userId: string, ref: StorageRef): Promise<void> {
    return firstValueFrom(this.client.send<void>('storage.remove', { userId, ref }));
  }

  signedUrl(userId: string, ref: StorageRef, ttlSec?: number): Promise<string> {
    return firstValueFrom(
      this.client.send<string>('storage.signedUrl', { userId, ref, ttlSec }),
    );
  }

  list(userId: string, prefix?: string): Promise<StorageRef[]> {
    return firstValueFrom(this.client.send<StorageRef[]>('storage.list', { userId, prefix }));
  }
}
```

`libs/upload-client/src/index.ts`:

```ts
export * from './lib/upload-client.module';
export * from './lib/upload-client.service';
```

- [ ] **Step 4: Declare deps**

```json
"dependencies": {
  "@icore/shared": "*",
  "@nestjs/common": "...",
  "@nestjs/microservices": "...",
  "rxjs": "...",
  "tslib": "..."
}
```

- [ ] **Step 5: Verify + commit**

```bash
yarn nx lint upload-client && yarn nx test upload-client && yarn nx build upload-client
git add libs/upload-client package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(upload-client): NestJS module wrapping the gateway → upload MS ClientProxy"
```

---

## Task 6: Gateway StorageModule + routes

- [ ] **Step 1: Install multer types**

```bash
yarn add -D @types/multer
```

(`@nestjs/platform-express` already pulled in via Plan 2 T7.)

- [ ] **Step 2: assertOwnership helper**

Create `apps/api/src/app/storage/assert-ownership.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import type { StorageRef } from '@icore/shared';

export function assertOwnership(ref: StorageRef, userId: string): void {
  if (!ref.path.startsWith(`${userId}/`)) {
    throw new ForbiddenException('foreign_storage_ref');
  }
}
```

- [ ] **Step 3: StorageController**

Create `apps/api/src/app/storage/storage.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UploadClientService } from '@icore/upload-client';
import type { StorageRef, VerifiedToken } from '@icore/shared';
import type { Request } from 'express';
import { assertOwnership } from './assert-ownership';

interface AuthedReq extends Request {
  user?: VerifiedToken;
}

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(
    private readonly uploadClient: UploadClientService,
    private readonly cfg: ConfigService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file and return its StorageRef' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthedReq,
  ): Promise<StorageRef> {
    if (!file) throw new BadRequestException('missing_file');
    const maxKb = Number(this.cfg.get<string>('MAX_FILE_SIZE_KB') ?? 5120);
    if (file.size > maxKb * 1024) {
      throw new PayloadTooLargeException(`file exceeds ${maxKb} KB`);
    }
    return this.uploadClient.upload(req.user!.uid, {
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @Get('signed-url')
  @ApiOperation({ summary: 'Sign a StorageRef for short-lived download' })
  @ApiQuery({ name: 'bucket', type: String })
  @ApiQuery({ name: 'path', type: String })
  @ApiQuery({ name: 'ttlSec', type: Number, required: false })
  signedUrl(
    @Query('bucket') bucket: string,
    @Query('path') path: string,
    @Query('ttlSec') ttlSec: string | undefined,
    @Req() req: AuthedReq,
  ): Promise<string> {
    const ref: StorageRef = { bucket, path };
    assertOwnership(ref, req.user!.uid);
    return this.uploadClient.signedUrl(
      req.user!.uid,
      ref,
      ttlSec ? Number(ttlSec) : undefined,
    );
  }

  @Delete('remove')
  @ApiOperation({ summary: 'Delete a file the caller owns' })
  remove(@Body() body: { bucket: string; path: string }, @Req() req: AuthedReq): Promise<void> {
    const ref: StorageRef = { bucket: body.bucket, path: body.path };
    assertOwnership(ref, req.user!.uid);
    return this.uploadClient.remove(req.user!.uid, ref);
  }

  @Get('list')
  @ApiOperation({ summary: "List the caller's stored files" })
  @ApiQuery({ name: 'prefix', type: String, required: false })
  list(@Query('prefix') prefix: string | undefined, @Req() req: AuthedReq): Promise<StorageRef[]> {
    return this.uploadClient.list(req.user!.uid, prefix);
  }
}
```

- [ ] **Step 4: StorageModule**

```ts
// apps/api/src/app/storage/storage.module.ts
import { Module } from '@nestjs/common';
import { UploadClientModule } from '@icore/upload-client';
import { StorageController } from './storage.controller';

@Module({
  imports: [UploadClientModule.forRoot()],
  controllers: [StorageController],
  exports: [UploadClientModule],
})
export class StorageModule {}
```

- [ ] **Step 5: Wire StorageModule into AppModule**

Edit `apps/api/src/app/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { AbilitiesModule } from './abilities/abilities.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'auth-burst', ttl: seconds(60), limit: 10 }]),
    AuthModule,
    AbilitiesModule,
    ProfileModule,
    StorageModule,
  ],
})
export class AppModule {}
```

`StorageModule` is imported AFTER `AuthModule` so the global `AuthGuard` covers `/api/storage/*` automatically (no `@Public()` on storage routes — all are authenticated by default).

- [ ] **Step 6: Update apps/api/package.json deps**

Add `@icore/upload-client` to `dependencies`.

- [ ] **Step 7: assertOwnership unit tests**

Create `apps/api/src/app/storage/__tests__/assert-ownership.unit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { assertOwnership } from '../assert-ownership';

describe('assertOwnership', () => {
  it('passes when the path starts with userId/', () => {
    expect(() =>
      assertOwnership({ bucket: 'b', path: 'user-1/foo.txt' }, 'user-1'),
    ).not.toThrow();
  });

  it('throws ForbiddenException on a foreign prefix', () => {
    expect(() =>
      assertOwnership({ bucket: 'b', path: 'attacker/foo.txt' }, 'user-1'),
    ).toThrow(ForbiddenException);
  });

  it('throws when path has no prefix at all', () => {
    expect(() => assertOwnership({ bucket: 'b', path: 'foo.txt' }, 'user-1')).toThrow(
      ForbiddenException,
    );
  });

  it('treats userId-substring-but-not-prefix as foreign', () => {
    // "user-12/x" should NOT match "user-1" — prefix must terminate at `/`
    expect(() =>
      assertOwnership({ bucket: 'b', path: 'user-12/x' }, 'user-1'),
    ).toThrow(ForbiddenException);
  });
});
```

The fourth case catches an off-by-one mistake. If `path.startsWith(${userId}/)` is implemented naively without the trailing slash check, the test catches it. (Our current impl uses `${userId}/` which IS terminated by `/`, so the test verifies the contract holds.)

- [ ] **Step 8: Verify + commit**

```bash
yarn nx test api
yarn nx lint api
yarn nx build api
```

All green. Test count goes from 9 → 13 (was AuthGuard 5 + AbilityGuard 4 + new assertOwnership 4 = 13).

```bash
git add apps/api package.json yarn.lock
git commit -m "feat(api): /api/storage/{upload,signed-url,remove,list} routes + assertOwnership"
```

---

## Task 7: `.env.example` + architecture docs

- [ ] **Step 1: Update `apps/api/.env.example`**

Add:

```
# Upload MS transport — must match apps/microservices/upload/.env
UPLOAD_TRANSPORT=tcp
UPLOAD_HOST=127.0.0.1
UPLOAD_PORT=4002

# Per-request multipart file size cap (KB)
MAX_FILE_SIZE_KB=5120
```

- [ ] **Step 2: Update `docs/architecture.md`**

- Flip Plan 4 row to ✅.
- Add storage routes to the routes table:
  - `POST /api/storage/upload` (multipart, Bearer)
  - `GET /api/storage/signed-url?bucket&path&ttlSec` (Bearer)
  - `DELETE /api/storage/remove` (Bearer)
  - `GET /api/storage/list?prefix` (Bearer)
- Extend the env catalogue row for `apps/api/.env` with `UPLOAD_*` + `MAX_FILE_SIZE_KB`.
- Extend / add row for `apps/microservices/upload/.env`.
- Append a Plan 4 deliverables section listing the lib + MS + gateway routes + ownership-enforcement strategy (gateway `assertOwnership` AND strategy-level `assertOwner` — defense in depth).

- [ ] **Step 3: Commit**

```bash
git add apps/api/.env.example docs/architecture.md
git commit -m "docs: mark Plan 4 done, document storage routes + UPLOAD_* env keys"
```

---

## Task 8: Final verify

- [ ] **Step 1: Full sweep**

```bash
yarn nx run-many -t lint test build
yarn format:check
```

Expected total tests: 25 (shared) + 9 (auth-supabase) + 9 (auth-firebase) + 7 (storage-supabase) + 13 (api: auth 5 + ability 4 + storage 4) + 19 (auth MS) + 5 (upload MS) = **~87 tests**, all green.

Format clean. Build green across all 11 projects (was 9 after Plan 3 + 2 new from Plan 4: storage-supabase, upload-client, upload — actually that's 12; recount).

- [ ] **Step 2: Smoke (manual, optional)**

Three terminals:

```bash
# Terminal 1: auth MS
AUTH_TRANSPORT=tcp AUTH_HOST=127.0.0.1 AUTH_PORT=4001 \
AUTH_PROVIDER=supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
yarn nx serve auth

# Terminal 2: upload MS
UPLOAD_TRANSPORT=tcp UPLOAD_HOST=127.0.0.1 UPLOAD_PORT=4002 \
STORAGE_PROVIDER=supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_STORAGE_BUCKET=icore-uploads \
yarn nx serve upload

# Terminal 3: gateway
AUTH_TRANSPORT=tcp AUTH_HOST=127.0.0.1 AUTH_PORT=4001 \
UPLOAD_TRANSPORT=tcp UPLOAD_HOST=127.0.0.1 UPLOAD_PORT=4002 \
API_PORT=3001 MAX_FILE_SIZE_KB=5120 \
yarn nx serve api
```

Then:

```bash
# register
curl -X POST http://localhost:3001/api/auth/register -H 'content-type: application/json' \
  -d '{"email":"u@x.com","password":"pw12345!"}'
TOKEN=<accessToken>

# upload
curl -X POST http://localhost:3001/api/storage/upload \
  -H "authorization: Bearer $TOKEN" \
  -F "file=@README.md"
# → 200 { bucket: "icore-uploads", path: "<uid>/<uuid>-README.md" }

# signed-url
curl "http://localhost:3001/api/storage/signed-url?bucket=icore-uploads&path=<uid>/<uuid>-README.md" \
  -H "authorization: Bearer $TOKEN"
# → 200 "<https url>"
```

Optional. Requires a real Supabase project. Plan 4 ships with mocked-only coverage; the real E2E smoke is deferred until the CI matrix lands.

---

## Self-Review Notes

**Spec coverage (Plan 1 spec Phase 5):**

- Upload MS with `@MessagePattern('storage.{upload,remove,signedUrl,list}')` → Task 4 ✅
- `SupabaseStorageStrategy` passing `runStorageContract` → Task 2 ✅
- `libs/upload-client` with `forRoot()` + typed service → Task 5 ✅
- Gateway `/api/storage/*` routes with `assertOwnership` → Task 6 ✅
- Multer file size enforcement (`MAX_FILE_SIZE_KB`) → Task 6 ✅
- Swagger annotations on storage routes → Task 6 ✅
- 3-layer env (transport / provider selection / provider credentials) → Tasks 4, 7 ✅
- `assertOwnership` runs at BOTH the gateway route AND the strategy (defense in depth) → Tasks 2, 6 ✅

**Deliberately deferred:**

- Firebase + Cloudinary storage strategies → Plan 5
- Real E2E test against a Supabase storage bucket → optional CI job
- Bucket auto-creation / migration → out of scope; `SUPABASE_STORAGE_BUCKET` must exist before MS boot
- MIME allowlist → out of scope for v0.1.0; clients send what they want, `MAX_FILE_SIZE_KB` is the only built-in gate
- Streaming uploads → out of scope; the base64-over-TCP approach is fine for files up to a few MB and matches the spec's gateway → MS contract. Real streaming would require swapping the transport (gRPC) or going direct-to-S3-style presigned uploads.

**Type consistency:**

- `StorageStrategy`, `StorageRef`, `FileInput` (from `@icore/shared`) used identically across `SupabaseStorageStrategy`, controller, client service, gateway controller.
- `assertOwnership(ref, userId)` signature is identical in `libs/storage-strategies/supabase` (private `assertOwner`) and `apps/api/src/app/storage/assert-ownership.ts` (exported helper).
- `@MessagePattern` names match exactly between the upload MS controller and the upload-client service.

**Out of scope (per spec Non-Goals):**

- Image transformations, video transcoding, etc.
- CDN integration.
- Server-side virus scanning.
