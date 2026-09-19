# BFF Server-Side Session Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status: NOT YET APPROVED FOR EXECUTION.** This plan exists to answer
> "what would it take" for a friend's BFF/opaque-session-cookie proposal.
> Per `AGENTS.md`'s "NO CODE CHANGES WITHOUT APPROVAL" rule, no task below
> starts until the user explicitly signs off on this plan.

**Goal:** Replace iCore's hybrid Bearer-access-token + httpOnly-refresh-cookie
auth model (shipped in PR #318) with a full BFF pattern: the browser holds
only an opaque, httpOnly session cookie; the gateway holds the real
Supabase/Firebase/MongoDB/Postgres token pair server-side.

**Architecture:** A new `SessionStore` (Redis-backed, provider-agnostic,
mirrors the existing `AuthStrategy`/`DBStrategy`/`StorageStrategy` pattern)
sits between `AuthGuard` and the existing `AuthStrategy` implementations,
which are otherwise unchanged. `AuthGuard` resolves identity from the
session cookie instead of a Bearer header, transparently refreshing the
provider token pair server-side under a distributed lock. Every mutating
route becomes cookie-authenticated, so CSRF protection — previously scoped
to `/auth/refresh` only — becomes a global guard.

**Tech Stack:** NestJS, ioredis, Redis 7 (already in `docker-compose.yml`),
Zustand, TanStack Router, `@idevconn/api-client`.

**Spec:** `docs/superpowers/specs/2026-09-19-bff-session-auth-design.md`

## Global Constraints

- Session cookie name: `icore_sid`. CSRF cookie: keep the existing
  `icore_csrf` name/shape from `libs/shared/src/http/auth-cookies.ts`.
- New env var: `SESSION_REDIS_URL` (gateway-only, dedicated — never reuse
  the transport-layer `AUTH_REDIS_URL`/`UPLOAD_REDIS_URL`/etc.).
- This is a breaking, clean-cutover change (see spec's Migration section,
  option 1) — no dual-guard bridge, no legacy Bearer fallback.
- Every new/modified file follows existing repo conventions: unit tests in
  a sibling `__tests__/` folder named `*.unit.test.ts`, strategy-style
  contracts named `run<Thing>Contract(name, factory)`.
- `npx prettier --write`, `nx lint`, `nx build` after every task, per
  `AGENTS.md`'s mandatory post-coding routine. Commit after each task.
- Branch: cut `feature/bff-session-auth` from `dev` before Task 1. PR
  targets `--base dev`. Changeset required (`minor` — new architecture,
  backward-incompatible for anyone already using the auth flow, but this
  repo has no live users of its own, so scaffold-internal `minor` is
  correct per existing changeset precedent, not `major`).
- Do **not** touch `libs/auth-strategies/*` — the `AuthStrategy` interface
  and its 4 implementations (Supabase/Firebase/MongoDB/Postgres) are
  unchanged. Only *how often and by whom* `refresh()`/`revoke()` are called
  changes.

---

## Task 1: `SessionStore` interface + `FakeSessionStore`

**Files:**
- Create: `libs/shared/src/session/session-store.ts`
- Create: `libs/shared/src/session/fakes/fake-session-store.ts`
- Create: `libs/shared/src/session/__tests__/session-store.contract.ts`
- Create: `libs/shared/src/session/__tests__/fake-session-store.contract.unit.test.ts`
- Modify: `libs/shared/src/index.ts` (export the new module)

**Interfaces:**
- Produces: `SessionRecord`, `SessionStore` interface, `FakeSessionStore`
  class, `runSessionStoreContract(name, factory)` — every later task that
  touches sessions imports these from `@icore/shared`.

- [ ] **Step 1: Write the interface**

```typescript
// libs/shared/src/session/session-store.ts
export interface SessionRecord {
  sessionId: string;
  uid: string;
  email: string;
  role?: string;
  providerAccessToken: string;
  providerRefreshToken: string;
  providerAccessTokenExpiresAt: number;
  createdAt: number;
  lastRefreshedAt: number;
}

export type NewSessionRecord = Omit<
  SessionRecord,
  'sessionId' | 'createdAt' | 'lastRefreshedAt'
>;

export interface SessionStore {
  create(record: NewSessionRecord): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | null>;
  update(sessionId: string, patch: Partial<SessionRecord>): Promise<void>;
  delete(sessionId: string): Promise<void>;
  deleteAllForUser(uid: string): Promise<void>;
  withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
```

- [ ] **Step 2: Write the contract test suite (runs against every implementation)**

```typescript
// libs/shared/src/session/__tests__/session-store.contract.ts
import { describe, expect, it, vi } from 'vitest';
import type { SessionStore } from '../session-store';

export function runSessionStoreContract(name: string, factory: () => SessionStore) {
  describe(`SessionStore contract: ${name}`, () => {
    it('creates and retrieves a session', async () => {
      const store = factory();
      const created = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: Date.now() + 3600_000,
      });
      expect(created.sessionId).toBeTruthy();
      const fetched = await store.get(created.sessionId);
      expect(fetched?.uid).toBe('u1');
      expect(fetched?.providerAccessToken).toBe('at1');
    });

    it('returns null for an unknown session', async () => {
      const store = factory();
      expect(await store.get('does-not-exist')).toBeNull();
    });

    it('update() patches only the given fields', async () => {
      const store = factory();
      const created = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: 1,
      });
      await store.update(created.sessionId, { providerAccessToken: 'at2' });
      const fetched = await store.get(created.sessionId);
      expect(fetched?.providerAccessToken).toBe('at2');
      expect(fetched?.providerRefreshToken).toBe('rt1');
    });

    it('delete() removes the session', async () => {
      const store = factory();
      const created = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: 1,
      });
      await store.delete(created.sessionId);
      expect(await store.get(created.sessionId)).toBeNull();
    });

    it('deleteAllForUser() kills every session for that uid, leaves others', async () => {
      const store = factory();
      const s1 = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: 1,
      });
      const s2 = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at2',
        providerRefreshToken: 'rt2',
        providerAccessTokenExpiresAt: 1,
      });
      const other = await store.create({
        uid: 'u2',
        email: 'c@d.com',
        providerAccessToken: 'at3',
        providerRefreshToken: 'rt3',
        providerAccessTokenExpiresAt: 1,
      });
      await store.deleteAllForUser('u1');
      expect(await store.get(s1.sessionId)).toBeNull();
      expect(await store.get(s2.sessionId)).toBeNull();
      expect(await store.get(other.sessionId)).not.toBeNull();
    });

    it('withRefreshLock() serializes concurrent callers for the same sessionId', async () => {
      const store = factory();
      const created = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: 1,
      });
      let running = 0;
      let maxConcurrent = 0;
      const fn = vi.fn(async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
        return 'done';
      });
      const results = await Promise.all([
        store.withRefreshLock(created.sessionId, fn),
        store.withRefreshLock(created.sessionId, fn),
        store.withRefreshLock(created.sessionId, fn),
      ]);
      expect(maxConcurrent).toBe(1);
      expect(results).toEqual(['done', 'done', 'done']);
    });
  });
}
```

- [ ] **Step 3: Write `FakeSessionStore`**

```typescript
// libs/shared/src/session/fakes/fake-session-store.ts
import type { NewSessionRecord, SessionRecord, SessionStore } from '../session-store';

export class FakeSessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly locks = new Map<string, Promise<unknown>>();

  async create(record: NewSessionRecord): Promise<SessionRecord> {
    const now = Date.now();
    const full: SessionRecord = {
      ...record,
      sessionId: globalThis.crypto.randomUUID(),
      createdAt: now,
      lastRefreshedAt: now,
    };
    this.sessions.set(full.sessionId, full);
    return full;
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async update(sessionId: string, patch: Partial<SessionRecord>): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, { ...existing, ...patch, lastRefreshedAt: Date.now() });
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteAllForUser(uid: string): Promise<void> {
    for (const [id, record] of this.sessions) {
      if (record.uid === uid) this.sessions.delete(id);
    }
  }

  // In-process single-flight: real distributed correctness is Redis's job
  // and is covered by RedisSessionStore's own contract run in Task 2, not here.
  async withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const pending = this.locks.get(sessionId);
    if (pending) {
      await pending.catch(() => undefined);
      return this.withRefreshLock(sessionId, fn);
    }
    const promise = fn();
    this.locks.set(sessionId, promise);
    try {
      return await promise;
    } finally {
      this.locks.delete(sessionId);
    }
  }
}
```

- [ ] **Step 4: Write the fake's contract test**

```typescript
// libs/shared/src/session/__tests__/fake-session-store.contract.unit.test.ts
import { FakeSessionStore } from '../fakes/fake-session-store';
import { runSessionStoreContract } from './session-store.contract';

runSessionStoreContract('FakeSessionStore', () => new FakeSessionStore());
```

- [ ] **Step 5: Export from `libs/shared/src/index.ts`**

Add alongside the existing `export * from './strategies/auth';` lines:

```typescript
export * from './session/session-store';
export * from './session/fakes/fake-session-store';
export * from './session/__tests__/session-store.contract';
```

- [ ] **Step 6: Run the test**

Run: `yarn nx test shared --testPathPattern=fake-session-store`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/session libs/shared/src/index.ts
git commit -m "feat(shared): add SessionStore interface + FakeSessionStore

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `RedisSessionStore`

**Files:**
- Create: `libs/shared/src/session/redis-session-store.ts`
- Create: `libs/shared/src/session/__tests__/redis-session-store.contract.integration.test.ts`
- Modify: `libs/shared/src/index.ts`
- Modify: `libs/shared/package.json` (add `ioredis` — already a dependency
  elsewhere in the workspace via `apps/microservices/jobs`, so this only
  adds it to `libs/shared`'s own `package.json` if Nx's dependency graph
  requires an explicit entry; check `yarn why ioredis` first)

**Interfaces:**
- Consumes: `SessionStore`, `SessionRecord`, `NewSessionRecord` (Task 1),
  `runSessionStoreContract` (Task 1).
- Produces: `RedisSessionStore` class — consumed by Task 4's
  `SessionModule` factory provider.

- [ ] **Step 1: Write `RedisSessionStore`**

```typescript
// libs/shared/src/session/redis-session-store.ts
import type IORedis from 'ioredis';
import type { NewSessionRecord, SessionRecord, SessionStore } from './session-store';

const SESSION_KEY = (id: string) => `session:${id}`;
const USER_SESSIONS_KEY = (uid: string) => `user-sessions:${uid}`;
const LOCK_KEY = (id: string) => `session-lock:${id}`;
const LOCK_TTL_MS = 10_000;
const LOCK_POLL_MS = 50;
// Sessions never auto-expire from Redis on their own -- the provider refresh
// token is the real expiry authority (30 days, matching the old icore_rt
// cookie's maxAge). Setting the same TTL here means a Redis-side idle
// session is reclaimed at the same point the refresh token would have
// stopped working anyway, instead of living forever as dead weight.
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: IORedis) {}

  async create(record: NewSessionRecord): Promise<SessionRecord> {
    const now = Date.now();
    const full: SessionRecord = {
      ...record,
      sessionId: globalThis.crypto.randomUUID(),
      createdAt: now,
      lastRefreshedAt: now,
    };
    await this.redis
      .multi()
      .set(SESSION_KEY(full.sessionId), JSON.stringify(full), 'EX', SESSION_TTL_SECONDS)
      .sadd(USER_SESSIONS_KEY(full.uid), full.sessionId)
      .exec();
    return full;
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(SESSION_KEY(sessionId));
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  }

  async update(sessionId: string, patch: Partial<SessionRecord>): Promise<void> {
    const existing = await this.get(sessionId);
    if (!existing) return;
    const updated: SessionRecord = { ...existing, ...patch, lastRefreshedAt: Date.now() };
    await this.redis.set(
      SESSION_KEY(sessionId),
      JSON.stringify(updated),
      'EX',
      SESSION_TTL_SECONDS,
    );
  }

  async delete(sessionId: string): Promise<void> {
    const existing = await this.get(sessionId);
    if (!existing) return;
    await this.redis
      .multi()
      .del(SESSION_KEY(sessionId))
      .srem(USER_SESSIONS_KEY(existing.uid), sessionId)
      .exec();
  }

  async deleteAllForUser(uid: string): Promise<void> {
    const ids = await this.redis.smembers(USER_SESSIONS_KEY(uid));
    if (ids.length === 0) return;
    const multi = this.redis.multi();
    for (const id of ids) multi.del(SESSION_KEY(id));
    multi.del(USER_SESSIONS_KEY(uid));
    await multi.exec();
  }

  // Advisory SET-NX-PX lock. Single-Redis deployment (this scaffold's
  // default) makes this sufficient -- see spec's SessionStore section for
  // why a full Redlock would be over-engineering here.
  async withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const key = LOCK_KEY(sessionId);
    const token = globalThis.crypto.randomUUID();
    while (true) {
      const acquired = await this.redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
      if (acquired === 'OK') break;
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
    }
    try {
      // Once the lock is acquired, re-read the session -- another caller may
      // have already refreshed it while we were waiting, and callers should
      // see that result, not redundantly refresh again.
      return await fn();
    } finally {
      const current = await this.redis.get(key);
      if (current === token) await this.redis.del(key);
    }
  }
}
```

- [ ] **Step 2: Write the integration contract test (real Redis)**

```typescript
// libs/shared/src/session/__tests__/redis-session-store.contract.integration.test.ts
import IORedis from 'ioredis';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { RedisSessionStore } from '../redis-session-store';
import { runSessionStoreContract } from './session-store.contract';

// Needs a real Redis at REDIS_TEST_URL (defaults to the docker-compose
// service on localhost:6379) -- distributed-lock correctness cannot be
// faked, matching this repo's existing mongodb-memory-server precedent for
// "this property only means something against the real backend."
const url = process.env.REDIS_TEST_URL ?? 'redis://localhost:6379';
let redis: IORedis;

beforeAll(() => {
  redis = new IORedis(url);
});

afterEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await redis.quit();
});

runSessionStoreContract('RedisSessionStore', () => new RedisSessionStore(redis));
```

- [ ] **Step 3: Export from `libs/shared/src/index.ts`**

Add: `export * from './session/redis-session-store';`

- [ ] **Step 4: Run against the docker-compose Redis**

Run: `docker compose up -d redis && yarn nx test shared --testPathPattern=redis-session-store`
Expected: PASS, same 6 tests as `FakeSessionStore`, including the
`withRefreshLock` concurrency assertion — this time proving it across
real Redis round-trips, not an in-process `Map`.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/session libs/shared/src/index.ts
git commit -m "feat(shared): add RedisSessionStore, verified against real Redis

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `SessionModule` factory provider + env wiring

**Files:**
- Create: `apps/api/src/app/session/session.module.ts`
- Create: `apps/api/src/app/session/session-store.provider.ts`
- Modify: `apps/api/.env.example` (add `SESSION_REDIS_URL`)
- Modify: `apps/api/src/app/app.module.ts` (import `SessionModule`)

**Interfaces:**
- Consumes: `SessionStore`, `RedisSessionStore` (Task 2).
- Produces: `SESSION_STORE` DI token — Task 4's `AuthGuard` and Task 5's
  `AuthController` both inject `@Inject(SESSION_STORE) store: SessionStore`.

- [ ] **Step 1: Write the provider**

```typescript
// apps/api/src/app/session/session-store.provider.ts
import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { RedisSessionStore, type SessionStore } from '@icore/shared';

export const SESSION_STORE = Symbol('SESSION_STORE');

export const sessionStoreProvider: Provider = {
  provide: SESSION_STORE,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): SessionStore => {
    const url = cfg.get<string>('SESSION_REDIS_URL');
    if (!url) {
      throw new Error(
        'SESSION_REDIS_URL is required — the BFF session model has no in-memory fallback for the gateway process (unlike optional per-feature Redis transports elsewhere in this repo, a session store losing state on restart would silently log every logged-in user out).',
      );
    }
    const logger = new Logger('SessionStore');
    const redis = new IORedis(url, { maxRetriesPerRequest: null });
    redis.on('error', (err: Error) => logger.warn(`Redis error: ${err.message}`));
    return new RedisSessionStore(redis);
  },
};
```

- [ ] **Step 2: Write the module**

```typescript
// apps/api/src/app/session/session.module.ts
import { Module } from '@nestjs/common';
import { sessionStoreProvider } from './session-store.provider';

@Module({
  providers: [sessionStoreProvider],
  exports: [sessionStoreProvider],
})
export class SessionModule {}
```

- [ ] **Step 3: Add env var to `apps/api/.env.example`**

Add near the existing commented-out `AUTH_REDIS_URL` block, with a comment
distinguishing it:

```
# Session store for the BFF auth model (Task 3, 2026-09-19 plan) -- this is
# the gateway's OWN Redis connection for opaque session cookies, distinct
# from AUTH_REDIS_URL above (which is an optional gateway<->auth-MS message
# transport choice). Required -- no fallback.
SESSION_REDIS_URL=redis://localhost:6379
```

- [ ] **Step 4: Import into `app.module.ts`**

Add `SessionModule` to the `imports` array of `apps/api/src/app/app.module.ts`,
alongside the existing feature modules.

- [ ] **Step 5: Verify the app boots**

Run: `docker compose up -d redis && yarn nx serve api`
Expected: no `SESSION_REDIS_URL is required` throw; gateway starts.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/session apps/api/.env.example apps/api/src/app/app.module.ts
git commit -m "feat(api): wire SessionModule + SESSION_REDIS_URL

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Rewrite `AuthGuard` to resolve identity from the session cookie

**Files:**
- Modify: `apps/api/src/app/auth/auth.guard.ts`
- Create: `apps/api/src/app/auth/__tests__/auth.guard.unit.test.ts`
- Create: `libs/shared/src/http/session-cookie.ts` (cookie read/write
  helpers, mirroring `auth-cookies.ts`'s existing shape)
- Create: `libs/shared/src/http/__tests__/session-cookie.unit.test.ts`
- Modify: `libs/shared/src/index.ts`

**Interfaces:**
- Consumes: `SESSION_STORE` token (Task 3), `SessionStore.get`/`update`/
  `withRefreshLock` (Task 1/2), `AuthClientService.refresh` (existing,
  unchanged).
- Produces: `req.user: VerifiedToken` populated the same shape as before —
  Task 5+ feature controllers (`notes`, `payment`, `storage`, `ai`) read
  `req.user` identically to today, no changes needed there for identity.

- [ ] **Step 1: Write the session cookie helpers**

```typescript
// libs/shared/src/http/session-cookie.ts
import type { Request, Response } from 'express';

const SESSION_COOKIE = 'icore_sid';
const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function setSessionCookie(res: Response, sessionId: string, isProd: boolean): void {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response, isProd: boolean): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
}

export function readSessionId(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
}
```

- [ ] **Step 2: Write the cookie helper test**

```typescript
// libs/shared/src/http/__tests__/session-cookie.unit.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { clearSessionCookie, readSessionId, setSessionCookie } from '../session-cookie';

function mockRes(): Response {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;
}

describe('session-cookie', () => {
  it('setSessionCookie sets icore_sid as httpOnly', () => {
    const res = mockRes();
    setSessionCookie(res, 'sid-1', false);
    expect(res.cookie).toHaveBeenCalledWith(
      'icore_sid',
      'sid-1',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('readSessionId reads the cookie value', () => {
    const req = { cookies: { icore_sid: 'sid-1' } } as any;
    expect(readSessionId(req)).toBe('sid-1');
  });

  it('readSessionId returns undefined when absent', () => {
    const req = { cookies: {} } as any;
    expect(readSessionId(req)).toBeUndefined();
  });

  it('clearSessionCookie clears icore_sid', () => {
    const res = mockRes();
    clearSessionCookie(res, true);
    expect(res.clearCookie).toHaveBeenCalledWith('icore_sid', expect.objectContaining({ secure: true }));
  });
});
```

- [ ] **Step 3: Run, confirm pass**

Run: `yarn nx test shared --testPathPattern=session-cookie`
Expected: PASS, 4 tests.

- [ ] **Step 4: Export helpers, rewrite `AuthGuard`**

Add to `libs/shared/src/index.ts`: `export * from './http/session-cookie';`

```typescript
// apps/api/src/app/auth/auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthClientService } from '@icore/auth-client';
import { readSessionId, type SessionStore } from '@icore/shared';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_STORE } from '../session/session-store.provider';

const REFRESH_SKEW_MS = 30_000; // refresh 30s before the provider's own expiry

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuthClientService) private readonly authClient: AuthClientService,
    @Inject(SESSION_STORE) private readonly sessionStore: SessionStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const sessionId = readSessionId(req);
    if (!sessionId) throw new UnauthorizedException('missing_session');

    const record = await this.sessionStore.get(sessionId);
    if (!record) throw new UnauthorizedException('invalid_session');

    const isStale = record.providerAccessTokenExpiresAt - REFRESH_SKEW_MS < Date.now();
    const current = isStale
      ? await this.sessionStore.withRefreshLock(sessionId, async () => {
          // Re-read inside the lock -- another request may have already
          // refreshed while we were waiting for the lock.
          const latest = await this.sessionStore.get(sessionId);
          if (!latest) return null;
          if (latest.providerAccessTokenExpiresAt - REFRESH_SKEW_MS >= Date.now()) return latest;
          return this.refreshSession(sessionId, latest);
        })
      : record;

    if (!current) throw new UnauthorizedException('invalid_session');

    req.user = { uid: current.uid, email: current.email, role: current.role };
    return true;
  }

  private async refreshSession(
    sessionId: string,
    record: NonNullable<Awaited<ReturnType<SessionStore['get']>>>,
  ) {
    try {
      const refreshed = await this.authClient.refresh(record.providerRefreshToken);
      const updated = {
        providerAccessToken: refreshed.accessToken,
        providerRefreshToken: refreshed.refreshToken,
        providerAccessTokenExpiresAt: Date.now() + refreshed.expiresIn * 1000,
        role: record.role,
      };
      await this.sessionStore.update(sessionId, updated);
      return { ...record, ...updated };
    } catch (err) {
      // Distinguish "the provider is genuinely unreachable" (infra blip --
      // don't punish a user with a perfectly good session) from "the
      // refresh token itself was rejected" (session really is dead). The
      // auth microservice's own transport failures surface as generic
      // Error/TimeoutError from @icore/auth-client, never as a typed
      // "invalid_refresh_token" -- treat anything that isn't an explicit
      // rejection as transient.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('invalid_refresh_token')) {
        await this.sessionStore.delete(sessionId);
        return null;
      }
      throw new ServiceUnavailableException('auth_service_unavailable');
    }
  }
}
```

- [ ] **Step 5: Write `AuthGuard` unit tests**

```typescript
// apps/api/src/app/auth/__tests__/auth.guard.unit.test.ts
import { ExecutionContext, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FakeSessionStore } from '@icore/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../auth.guard';

function ctxWith(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let sessionStore: FakeSessionStore;
  let authClient: { refresh: ReturnType<typeof vi.fn> };
  let reflector: Reflector;
  let guard: AuthGuard;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
    authClient = { refresh: vi.fn() };
    reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    guard = new AuthGuard(reflector, authClient as any, sessionStore);
  });

  it('rejects a request with no session cookie', async () => {
    const req: any = { cookies: {} };
    await expect(guard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown session id', async () => {
    const req: any = { cookies: { icore_sid: 'nope' } };
    await expect(guard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('populates req.user for a fresh session, does not refresh', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() + 3600_000,
    });
    const req: any = { cookies: { icore_sid: record.sessionId } };
    await guard.canActivate(ctxWith(req));
    expect(req.user).toEqual({ uid: 'u1', email: 'a@b.com', role: undefined });
    expect(authClient.refresh).not.toHaveBeenCalled();
  });

  it('refreshes a stale session exactly once under concurrent requests', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() - 1000,
    });
    authClient.refresh.mockResolvedValue({
      accessToken: 'at2',
      refreshToken: 'rt2',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@b.com' },
    });
    const req1: any = { cookies: { icore_sid: record.sessionId } };
    const req2: any = { cookies: { icore_sid: record.sessionId } };
    await Promise.all([guard.canActivate(ctxWith(req1)), guard.canActivate(ctxWith(req2))]);
    expect(authClient.refresh).toHaveBeenCalledTimes(1);
    expect(req1.user.uid).toBe('u1');
    expect(req2.user.uid).toBe('u1');
  });

  it('maps an explicit invalid_refresh_token rejection to 401 and deletes the session', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() - 1000,
    });
    authClient.refresh.mockRejectedValue(new Error('invalid_refresh_token'));
    const req: any = { cookies: { icore_sid: record.sessionId } };
    await expect(guard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await sessionStore.get(record.sessionId)).toBeNull();
  });

  it('maps a transient auth-service failure to 503, keeps the session', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() - 1000,
    });
    authClient.refresh.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const req: any = { cookies: { icore_sid: record.sessionId } };
    await expect(guard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await sessionStore.get(record.sessionId)).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run tests**

Run: `yarn nx test api --testPathPattern=auth.guard`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.guard.ts apps/api/src/app/auth/__tests__/auth.guard.unit.test.ts \
  libs/shared/src/http/session-cookie.ts libs/shared/src/http/__tests__/session-cookie.unit.test.ts \
  libs/shared/src/index.ts
git commit -m "feat(auth): resolve identity from session cookie, refresh under distributed lock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Rewrite `AuthController` — session-cookie model for every auth route

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Modify: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `SESSION_STORE` token (Task 3), `setSessionCookie`/
  `clearSessionCookie`/`readSessionId` (Task 4), existing
  `AuthClientService` methods (unchanged), existing `generateCsrfToken`
  (unchanged, from `auth-cookies.ts`).
- Produces: every response body drops `accessToken`/`refreshToken`
  entirely — becomes `{ user }` only. Task 7 (frontend) depends on this
  exact shape.

- [ ] **Step 1: Rewrite the controller**

Every route that used to call `setAuthCookies({ refreshToken, csrfToken })`
now calls `sessionStore.create(...)` + `setSessionCookie(res, sessionId)`
+ `generateCsrfToken()`/`res.cookie('icore_csrf', ...)`, and returns
`{ user }` only:

```typescript
// apps/api/src/app/auth/auth.controller.ts (full replacement)
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, seconds } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthClientService } from '@icore/auth-client';
import {
  generateCsrfToken,
  readSessionId,
  setSessionCookie,
  clearSessionCookie,
  verifyCsrf,
  type AuthSession,
  type OAuthProvider,
  type SessionStore,
  type VerifiedToken,
} from '@icore/shared';
import { Public } from './public.decorator';
import { SESSION_STORE } from '../session/session-store.provider';

const OAUTH_PROVIDERS: ReadonlySet<OAuthProvider> = new Set(['google', 'github']);
const CSRF_COOKIE = 'icore_csrf';

function assertProvider(value: string): OAuthProvider {
  if (!OAUTH_PROVIDERS.has(value as OAuthProvider)) {
    throw new UnauthorizedException(`unknown_oauth_provider: ${value}`);
  }
  return value as OAuthProvider;
}

@ApiTags('auth')
@Controller('auth')
@Throttle({ 'auth-burst': { limit: 10, ttl: seconds(60) } })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authClient: AuthClientService,
    private readonly cfg: ConfigService,
    @Inject(SESSION_STORE) private readonly sessionStore: SessionStore,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a new user and start a server-side session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 } },
    },
  })
  async register(@Body() body: { email: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const session = await this.authClient.signup(body.email, body.password);
    return this.startSession(session, res);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Exchange email + password for a server-side session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
    },
  })
  async login(@Body() body: { email: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const session = await this.authClient.login(body.email, body.password);
    return this.startSession(session, res);
  }

  @Get('session')
  @ApiOperation({ summary: 'Resolve the current session cookie into a user, or 401' })
  async getSession(@Req() req: Request) {
    // AuthGuard already resolved+refreshed by the time this handler runs;
    // it populated req.user in exactly the VerifiedToken shape.
    const user = (req as Request & { user?: VerifiedToken }).user;
    if (!user) throw new UnauthorizedException('invalid_session');
    return { user: { id: user.uid, email: user.email, role: user.role } };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'End the server-side session and clear cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sessionId = readSessionId(req);
    if (sessionId) {
      const record = await this.sessionStore.get(sessionId);
      // Delete the session record FIRST -- the moment this call returns,
      // the session is provably dead server-side even if the provider
      // revoke below fails. (Same ordering rationale as the old
      // clearCookies-after-best-effort-revoke logout, just applied to the
      // store instead of the cookie.)
      await this.sessionStore.delete(sessionId);
      if (record) {
        try {
          await this.authClient.revoke(record.providerRefreshToken);
        } catch (err) {
          this.logger.warn('logout: provider revoke failed, session already deleted', err);
        }
      }
    }
    clearSessionCookie(res, this.isProd());
    res.clearCookie(CSRF_COOKIE, { path: '/', secure: this.isProd() });
    return { ok: true };
  }

  @Public()
  @Post('magic-link')
  @ApiOperation({ summary: 'Send a passwordless sign-in link to the email' })
  @ApiBody({
    schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
  })
  requestMagicLink(@Body() body: { email: string }) {
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    return this.authClient.sendMagicLink(body.email, `${origin}/auth/callback`);
  }

  @Public()
  @Post('magic-link/verify')
  @ApiOperation({ summary: 'Exchange a magic-link token for a server-side session' })
  @ApiBody({ schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } })
  async verifyMagicLink(@Body() body: { token: string }, @Res({ passthrough: true }) res: Response) {
    const session = await this.authClient.verifyMagicLink(body.token);
    return this.startSession(session, res);
  }

  @Public()
  @Post('session/adopt')
  @ApiOperation({
    summary: 'Adopt a Supabase implicit-flow session (from a URL hash fragment) as a server-side session',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['accessToken', 'refreshToken'],
      properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } },
    },
  })
  async adoptSession(
    @Body() body: { accessToken: string; refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Same token-substitution defense as before Task 5 (see PR #324):
    // verify() and refresh() are independent calls; only a genuinely
    // paired token pair can satisfy refreshed.user.id === verified.uid.
    let verified: VerifiedToken;
    try {
      verified = await this.authClient.verify(body.accessToken);
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    let refreshed: AuthSession;
    try {
      refreshed = await this.authClient.refresh(body.refreshToken);
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    if (refreshed.user.id !== verified.uid) throw new UnauthorizedException('invalid_token');
    return this.startSession(refreshed, res, verified.role);
  }

  @Public()
  @Get('oauth/:provider')
  @ApiOperation({ summary: 'Start an OAuth flow — redirects to the provider' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  async oauthStart(@Param('provider') providerRaw: string, @Res() res: Response) {
    const provider = assertProvider(providerRaw);
    const origin = this.cfg.get<string>('API_ORIGIN') ?? 'http://localhost:3001';
    const { redirectUrl, state } = await this.authClient.startOAuth(
      provider,
      `${origin}/api/auth/oauth/${provider}/callback`,
    );
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(redirectUrl);
  }

  @Public()
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'Provider redirected back — exchange code for a server-side session' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  async oauthCallback(
    @Param('provider') providerRaw: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = assertProvider(providerRaw);
    const cookieState = (req.cookies as Record<string, string> | undefined)?.['oauth_state'];
    if (!cookieState || cookieState !== state) throw new UnauthorizedException('oauth_state_mismatch');
    const session = await this.authClient.completeOAuth(provider, code, state);
    res.clearCookie('oauth_state');
    await this.startSessionRedirect(session, res);
  }

  private async startSession(session: AuthSession, res: Response, role?: string) {
    const record = await this.sessionStore.create({
      uid: session.user.id,
      email: session.user.email,
      role,
      providerAccessToken: session.accessToken,
      providerRefreshToken: session.refreshToken,
      providerAccessTokenExpiresAt: Date.now() + session.expiresIn * 1000,
    });
    setSessionCookie(res, record.sessionId, this.isProd());
    const csrfToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE, csrfToken, { path: '/', secure: this.isProd(), sameSite: this.isProd() ? 'none' : 'lax' });
    return { user: { id: session.user.id, email: session.user.email, role } };
  }

  // OAuth's own callback ends in a redirect, not a JSON body, so it sets
  // cookies then bounces the browser back to the SPA -- no tokens in the
  // URL fragment at all now (unlike the pre-BFF version), since there is
  // nothing left for client JS to read.
  private async startSessionRedirect(session: AuthSession, res: Response) {
    const record = await this.sessionStore.create({
      uid: session.user.id,
      email: session.user.email,
      providerAccessToken: session.accessToken,
      providerRefreshToken: session.refreshToken,
      providerAccessTokenExpiresAt: Date.now() + session.expiresIn * 1000,
    });
    setSessionCookie(res, record.sessionId, this.isProd());
    const csrfToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE, csrfToken, { path: '/', secure: this.isProd(), sameSite: this.isProd() ? 'none' : 'lax' });
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    return res.redirect(`${origin}/dashboard`);
  }

  private isProd(): boolean {
    return this.cfg.get<string>('NODE_ENV') === 'production';
  }
}
```

Note: `verifyCsrf` import stays used by Task 6's global `CsrfGuard`, not by
this controller directly anymore — `/auth/refresh` (the one route that used
to hand-call it) no longer exists as a route at all; refreshing is now
`AuthGuard`'s job on every request, invisible to the client.

- [ ] **Step 2: Rewrite `auth.controller.unit.test.ts`**

Read the existing test file first (`apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`)
to preserve every currently-covered scenario; update each assertion for the
new `{ user }`-only response shape and inject a `FakeSessionStore` in place
of the old cookie-mock assertions. Concretely:

```typescript
// apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts (key excerpts —
// merge into the existing file's structure, keep every pre-existing describe
// block, update bodies as shown)
import { FakeSessionStore } from '@icore/shared';
// ... existing imports ...

describe('AuthController', () => {
  let sessionStore: FakeSessionStore;
  // ... existing authClient/cfg mocks ...

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
    controller = new AuthController(authClient as any, cfg as any, sessionStore);
  });

  it('login() creates a session record and returns only { user }', async () => {
    authClient.login.mockResolvedValue({
      accessToken: 'at1',
      refreshToken: 'rt1',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@b.com' },
    });
    const res = mockRes();
    const result = await controller.login({ email: 'a@b.com', password: 'x' }, res);
    expect(result).toEqual({ user: { id: 'u1', email: 'a@b.com', role: undefined } });
    expect((result as any).accessToken).toBeUndefined();
    expect(res.cookie).toHaveBeenCalledWith('icore_sid', expect.any(String), expect.objectContaining({ httpOnly: true }));
  });

  it('logout() deletes the session record before clearing cookies', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() + 3600_000,
    });
    const req: any = { cookies: { icore_sid: record.sessionId } };
    const res = mockRes();
    await controller.logout(req, res);
    expect(await sessionStore.get(record.sessionId)).toBeNull();
    expect(authClient.revoke).toHaveBeenCalledWith('rt1');
  });

  it('session/adopt rejects a mismatched token pair (token-substitution defense preserved)', async () => {
    authClient.verify.mockResolvedValue({ uid: 'victim', email: 'v@b.com' });
    authClient.refresh.mockResolvedValue({
      accessToken: 'at2',
      refreshToken: 'rt2',
      expiresIn: 3600,
      user: { id: 'attacker', email: 'a@b.com' },
    });
    const res = mockRes();
    await expect(
      controller.adoptSession({ accessToken: 'victim-at', refreshToken: 'attacker-rt' }, res),
    ).rejects.toThrow('invalid_token');
  });
});
```

- [ ] **Step 3: Run all `AuthController` tests**

Run: `yarn nx test api --testPathPattern=auth.controller`
Expected: PASS, every scenario from the pre-existing file plus the new ones
above.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): rewrite AuthController for the session-cookie model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Global `CsrfGuard` — every mutating route, not just auth

**Files:**
- Create: `apps/api/src/app/http/csrf.guard.ts`
- Create: `apps/api/src/app/http/__tests__/csrf.guard.unit.test.ts`
- Modify: `apps/api/src/app/app.module.ts` (register as `APP_GUARD`)

**Interfaces:**
- Consumes: `verifyCsrf` (existing, unchanged, from `@icore/shared`).
- Produces: nothing new consumed by later tasks — this is a global,
  `APP_GUARD`-registered guard, not injected anywhere explicitly.

- [ ] **Step 1: Write the guard**

```typescript
// apps/api/src/app/http/csrf.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { verifyCsrf } from '@icore/shared';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    // Public, cookie-free auth routes (login/register/magic-link/oauth/
    // session-adopt) issue the very cookies CSRF protection depends on --
    // they cannot require a CSRF token that doesn't exist yet. logout is
    // Public too but DOES already have cookies from an active session;
    // still exempt it deliberately -- a forged logout is a minor
    // availability nuisance, not a security compromise, and exempting it
    // avoids a chicken-and-egg failure mode for any client that lost its
    // CSRF cookie but still holds a session cookie.
    if (req.path.startsWith('/api/auth/')) return true;
    if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
    return true;
  }
}
```

- [ ] **Step 2: Write the guard test**

```typescript
// apps/api/src/app/http/__tests__/csrf.guard.unit.test.ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CsrfGuard } from '../csrf.guard';

function ctxFor(method: string, path: string, cookies: Record<string, string>, headers: Record<string, string>): ExecutionContext {
  const req = { method, path, cookies, headers };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows GET regardless of CSRF headers', () => {
    expect(guard.canActivate(ctxFor('GET', '/api/notes', {}, {}))).toBe(true);
  });

  it('allows auth routes without a CSRF token', () => {
    expect(guard.canActivate(ctxFor('POST', '/api/auth/login', {}, {}))).toBe(true);
  });

  it('rejects a mutating non-auth route with no CSRF cookie/header', () => {
    expect(() => guard.canActivate(ctxFor('POST', '/api/notes', {}, {}))).toThrow(ForbiddenException);
  });

  it('rejects a mismatched CSRF cookie/header pair', () => {
    expect(() =>
      guard.canActivate(ctxFor('POST', '/api/notes', { icore_csrf: 'a' }, { 'x-csrf-token': 'b' })),
    ).toThrow(ForbiddenException);
  });

  it('allows a matching CSRF cookie/header pair', () => {
    expect(
      guard.canActivate(ctxFor('POST', '/api/notes', { icore_csrf: 'same' }, { 'x-csrf-token': 'same' })),
    ).toBe(true);
  });

  it('allows DELETE with a matching pair (not just POST)', () => {
    expect(
      guard.canActivate(ctxFor('DELETE', '/api/notes/1', { icore_csrf: 'same' }, { 'x-csrf-token': 'same' })),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `yarn nx test api --testPathPattern=csrf.guard`
Expected: PASS, 6 tests.

- [ ] **Step 4: Register globally in `app.module.ts`**

`CsrfGuard` must run **after** `AuthGuard` (needs `req.user`/cookies
resolved first is not actually required here since it only reads raw
cookies/headers, but ordering still matters for NestJS's `APP_GUARD`
array — guards run in registration order, and rejecting CSRF before
auth on an already-unauthenticated request just produces a slightly
wrong error code, not a security gap; keep `AuthGuard` first anyway for
clean error semantics):

```typescript
// apps/api/src/app/app.module.ts — add to providers[]
{ provide: APP_GUARD, useClass: AuthGuard },
{ provide: APP_GUARD, useClass: CsrfGuard },
```

(`AuthGuard` was previously registered the same way — confirm the exact
existing registration by reading `app.module.ts` before editing; add
`CsrfGuard`'s entry immediately after it.)

- [ ] **Step 5: Manual verification against the 10 identified mutating routes**

No code change needed in `notes.controller.ts`/`payment.controller.ts`/
`storage.controller.ts`/`ai.controller.ts` themselves — `CsrfGuard` is
global. Verify by running the full `api` e2e/unit suite and confirming
each of these 10 routes now 403s without a CSRF header:
`POST /notes`, `PATCH /notes/:id`, `DELETE /notes/:id`,
`POST /payment/orders`, `POST /payment/orders/:id/capture`,
`POST /storage/upload`, `DELETE /storage/remove`,
`POST /ai/generate`, `POST /ai/orchestrate`, `POST /ai/rag/query`.

Run: `yarn nx test api`
Expected: any pre-existing test for these routes that posts without a
`X-CSRF-Token` header now needs that header added (or the guard mocked)
to keep passing — fix each failing test by adding
`headers: { 'X-CSRF-Token': 'test-token' }` and a matching `icore_csrf`
cookie mock to its request, matching how `auth.controller.unit.test.ts`
already mocks CSRF for `/auth/refresh` today.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/http apps/api/src/app/app.module.ts
git commit -m "feat(api): promote CSRF protection to a global guard for every mutating route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Session revocation — admin kick + role-change invalidation

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts` (add
  `POST /auth/admin/revoke-user/:uid`)
- Modify: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `SessionStore.deleteAllForUser` (Task 1/2), existing CASL
  `@CheckAbility` decorator (unchanged).

- [ ] **Step 1: Add the route**

```typescript
// apps/api/src/app/auth/auth.controller.ts — add alongside the other routes
import { CheckAbility } from '../abilities/check-ability.decorator'; // exact import path: confirm against an existing @CheckAbility usage, e.g. apps/api/src/app/notes/notes.controller.ts's admin routes, before wiring this in

  @Post('admin/revoke-user/:uid')
  @CheckAbility('manage', 'User')
  @ApiOperation({ summary: 'Immediately kill every active session for a user (admin only)' })
  async revokeUser(@Param('uid') uid: string) {
    await this.sessionStore.deleteAllForUser(uid);
    return { ok: true };
  }
```

- [ ] **Step 2: Write the test**

```typescript
it('admin revoke-user kills every session for that uid', async () => {
  const s1 = await sessionStore.create({
    uid: 'target',
    email: 't@b.com',
    providerAccessToken: 'at1',
    providerRefreshToken: 'rt1',
    providerAccessTokenExpiresAt: Date.now() + 3600_000,
  });
  await controller.revokeUser('target');
  expect(await sessionStore.get(s1.sessionId)).toBeNull();
});
```

- [ ] **Step 3: Run, confirm pass**

Run: `yarn nx test api --testPathPattern=auth.controller`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): add admin session revocation by uid

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Frontend migration — drop the access token entirely

**Files:**
- Delete: `libs/template-shared/src/lib/api/access-token.ts`
- Modify: `libs/template-shared/src/lib/api/create-api.ts`
- Modify: `libs/template-shared/src/index.ts` (drop the deleted export)
- Modify: `apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx`
- Modify every other call site of `setAccessToken`/`getAccessToken` (find
  via `grep -rl "setAccessToken\|getAccessToken" apps/templates libs/template-shared`
  before starting — expect hits in the login/register/magic-link-verify
  page components and the app bootstrap component)

**Interfaces:**
- Consumes: `{ user }`-only response shape from Task 5's `AuthController`.
- Produces: nothing new — this task only removes the now-dead
  access-token plumbing.

- [ ] **Step 1: Update `create-api.ts`**

```typescript
// libs/template-shared/src/lib/api/create-api.ts
import { createApiClient } from '@idevconn/api-client';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    credentials: 'include',
    // No access token, no client-driven refresh at all under the BFF model
    // -- the session cookie is the only credential, and AuthGuard refreshes
    // the provider token pair server-side, invisibly. api-client still
    // needs SOME truthy getAccessToken/getRefreshToken to not short-circuit
    // requests as unauthenticated; the session cookie is what actually
    // authenticates, these are just satisfying the client library's shape.
    getAccessToken: () => 'cookie',
    getRefreshToken: () => 'cookie',
    onUnauthorized: () => {
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
```

- [ ] **Step 2: Delete `access-token.ts`, remove its export**

Delete the file. In `libs/template-shared/src/index.ts`, remove the line
exporting `access-token` (grep for `access-token` to find it exactly).

- [ ] **Step 3: Rewrite `auth.oauth.callback.tsx`**

The gateway's `oauthCallback` (Task 5) now redirects straight to
`/dashboard` with cookies already set — there is no hash fragment to parse
at all for the server-redirect path. The *only* remaining reason this page
exists is Supabase's implicit-flow hash fragment for magic-link/OAuth
projects configured that way (unchanged concern from PR #324) — but now
`session/adopt`'s response is `{ user }` only, no `accessToken` to hold
client-side:

```typescript
// apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';
import { api } from '@/main';

type Status = 'restoring' | 'done' | 'error';

function OAuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setUser = useAuthStore((s) => s.setUser);
  const [status, setStatus] = useState<Status>('restoring');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    // Server-redirect path (Task 5's oauthCallback) already set cookies and
    // sent the browser straight to /dashboard -- this page is only ever hit
    // for Supabase's implicit-flow hash fragment now.
    if (!accessToken || !refreshToken) {
      setStatus('error');
      notify.error(t('auth.oauthCallbackMissingTokens'));
      void navigate({ to: '/login' });
      return;
    }

    void (async () => {
      try {
        const session = await api<{ user: { id: string; email: string; role?: string } }>(
          '/auth/session/adopt',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, refreshToken }),
          },
        );
        setUser(session.user);
        setStatus('done');
        void navigate({ to: '/dashboard' });
      } catch {
        setStatus('error');
        notify.error(t('auth.oauthFailed'));
        void navigate({ to: '/login' });
      }
    })();
  }, []);

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        {status === 'restoring' && (
          <>
            <Loader2 className="text-muted-foreground size-8 animate-spin" />
            <p className="text-muted-foreground text-sm">{t('auth.callbackVerifying')}</p>
          </>
        )}
        {status === 'error' && <p className="text-destructive text-sm">{t('auth.oauthFailed')}</p>}
      </div>
    </main>
  );
}

export const Route = createFileRoute('/auth/oauth/callback')({ component: OAuthCallbackPage });
```

- [ ] **Step 4: Update every other `setAccessToken`/`getAccessToken` call site**

Run `grep -rl "setAccessToken\|getAccessToken" apps/templates libs/template-shared`
first — this plan cannot enumerate every hit sight-unseen, but the pattern
at each site is identical: delete the `setAccessToken(...)` call (there is
no token to hold anymore — the response is `{ user }` only) and keep the
`setUser(...)` call. Do this for login/register/magic-link-verify page
components and any app-bootstrap/`AuthBootstrap` component found by the
grep.

- [ ] **Step 5: Rewrite the app bootstrap to hit `GET /auth/session`**

Find the current bootstrap component (grep for `useAuthStore` +
`useEffect` in `apps/templates/client-shadcn/src/`) and replace its
silent-refresh-on-mount logic with a single call:

```typescript
useEffect(() => {
  void (async () => {
    try {
      const { user } = await api<{ user: AuthUser }>('/auth/session');
      setUser(user);
    } catch {
      // 401 -- no session, or a 503 -- auth service down; either way the
      // user is treated as logged out for this render. A 503 does not mean
      // "corrupt the stored session" since there is no client-stored
      // session anymore to corrupt -- the cookie is untouched, so a retry
      // (page reload) recovers automatically once the auth service is back.
      useAuthStore.getState().logout();
    }
  })();
}, []);
```

- [ ] **Step 6: Build + manually verify in a browser**

Run: `yarn nx build client-shadcn && yarn nx serve client-shadcn`
Manually: open devtools Application tab, log in, confirm `localStorage`
has no access token, `document.cookie` shows only `icore_csrf` (not
`icore_sid` — httpOnly cookies are invisible to `document.cookie` by
design; confirm via the Network tab's response headers instead), reload
the page, confirm the session survives (dashboard still shows the logged
-in user, no forced redirect to `/login`).

- [ ] **Step 7: Commit**

```bash
git add libs/template-shared apps/templates/client-shadcn
git commit -m "feat(client): drop the in-memory access token, cookie-only BFF auth

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Per-provider live verification

**Files:**
- No new source files — this task runs the existing 4
  `AuthStrategy` implementations' contract suites plus a new burst
  -concurrency check against each reachable live backend.
- Create: `libs/auth-strategies/supabase/src/lib/__tests__/refresh-burst.integration.test.ts`
  (and the equivalent for firebase/mongodb/postgres, same shape, same
  filename pattern, adjusted per strategy's own existing integration-test
  setup — read each strategy's existing `*.contract.integration.test.ts`
  first to match its exact fixture/teardown pattern before writing this).

**Interfaces:**
- Consumes: each strategy's existing, unchanged `refresh(refreshToken)`.

- [ ] **Step 1: Write the burst test (Supabase shown; replicate exactly for firebase/mongodb/postgres against each one's own live/local backend)**

```typescript
// libs/auth-strategies/supabase/src/lib/__tests__/refresh-burst.integration.test.ts
import { describe, expect, it } from 'vitest';
import { SupabaseAuthStrategy } from '../supabase-auth.strategy';
// import whatever this strategy's existing contract test uses to build a
// live client + a throwaway signed-up test user — match that setup exactly.

describe('SupabaseAuthStrategy refresh under distributed-lock-simulated burst', () => {
  it('N calls to refresh() with the SAME refresh token do not all succeed independently', async () => {
    // This test exists to characterize Supabase's actual behavior when
    // refresh() is called concurrently for one session -- NOT to test
    // withRefreshLock itself (that's Task 2's job, against Redis). The
    // production code path never calls refresh() concurrently for one
    // session because AuthGuard's withRefreshLock prevents it -- this test
    // is what tells us WHY that lock is load-bearing: Supabase rotates the
    // refresh token on every call, so an unguarded second concurrent call
    // with the now-stale token would fail loudly in production if the lock
    // were ever accidentally bypassed.
    const strategy = new SupabaseAuthStrategy(/* ...live config, matching the existing contract test... */);
    const session = await strategy.signIn(/* throwaway test user email/password */);
    const results = await Promise.allSettled([
      strategy.refresh(session.refreshToken),
      strategy.refresh(session.refreshToken),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run against whichever backends are actually reachable in this environment**

Run: `yarn nx test auth-strategies-supabase --testPathPattern=refresh-burst`
(repeat per provider). Expected: PASS, confirming each provider genuinely
rotates-and-invalidates on refresh — the exact property `withRefreshLock`
exists to guard against a request path ever hitting.

- [ ] **Step 3: Commit**

```bash
git add libs/auth-strategies/*/src/lib/__tests__/refresh-burst.integration.test.ts
git commit -m "test(auth-strategies): characterize concurrent-refresh behavior per provider

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Full live E2E, changeset, docs, PR

**Files:**
- Create: `.changeset/bff-session-auth.md`
- Modify: `docs/runbooks/` (new runbook — see below)
- Modify: `apps/client/e2e/` (or the relevant `apps/templates/client-*/e2e/`
  path — confirm exact location via the existing PR #318 Playwright spec
  before adding)

- [ ] **Step 1: Write the changeset**

```markdown
---
'@idevconn/create-icore': minor
---

Replaces the hybrid Bearer-access-token + httpOnly-refresh-cookie auth
model with a full BFF (Backend-For-Frontend) pattern: the browser now
holds only an opaque, httpOnly `icore_sid` session cookie. The gateway
resolves identity from a new Redis-backed `SessionStore`, transparently
refreshing the underlying provider (Supabase/Firebase/MongoDB/Postgres)
token pair server-side under a distributed lock. CSRF protection is now a
global guard covering every mutating route, not just `/auth/refresh`.
Requires a new `SESSION_REDIS_URL` env var on the gateway. Breaking change:
every existing session is invalidated on deploy (forced re-login).
```

- [ ] **Step 2: Write the Playwright E2E spec**

```typescript
// apps/client/e2e/bff-session-auth.spec.ts (path confirmed against the
// existing e2e directory structure before creating)
import { expect, test } from '@playwright/test';

test.describe('BFF session auth', () => {
  test('login, mutate through every feature module, reload, logout kills the session', async ({ page, request }) => {
    await page.goto('/login');
    await page.fill('[name=email]', 'e2e@example.com');
    await page.fill('[name=password]', 'password123');
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/dashboard/);

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'icore_sid')?.httpOnly).toBe(true);
    expect(cookies.find((c) => c.name === 'icore_csrf')?.httpOnly).toBe(false);

    const storage = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(storage).not.toContain('accessToken');

    // Create a note through the UI -- exercises CsrfGuard on a real mutating route.
    await page.goto('/notes');
    await page.click('text=New note');
    await page.fill('[name=title]', 'e2e note');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=e2e note')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/dashboard|notes/);
    await expect(page.locator('text=e2e note')).toBeVisible();

    const sessionCookie = cookies.find((c) => c.name === 'icore_sid');
    await page.click('text=Logout');
    await expect(page).toHaveURL(/login/);

    // Replay the OLD session cookie via a raw request, bypassing the
    // browser entirely -- confirms deletion is immediate, not "eventually
    // consistent with the provider's own token expiry."
    const replay = await request.get('/api/auth/session', {
      headers: { cookie: `icore_sid=${sessionCookie?.value}` },
    });
    expect(replay.status()).toBe(401);
  });
});
```

- [ ] **Step 3: Run the full suite**

Run: `yarn nx run-many -t lint test build` then
`yarn nx e2e client-shadcn-e2e` (confirm exact e2e project name via
`nx show projects` first).
Expected: all green.

- [ ] **Step 4: Write the runbook**

Create `docs/runbooks/bff-session-auth-migration.md` covering: what changed
and why (link the spec), the new `SESSION_REDIS_URL` requirement, the
forced-relogin-on-deploy consequence, and a rollback note (revert this PR
-> `dev`'s prior commit restores the PR #318 hybrid model, since no schema
/data migration is involved — `SessionRecord`s are ephemeral Redis state,
not a persisted store).

- [ ] **Step 5: Update `AGENTS.md`**

Add a bullet to the `## Important` section documenting the new
`icore_sid`/`SESSION_REDIS_URL`/global `CsrfGuard`, following the existing
bullet style (e.g. the `icore_rt` / Bull Board / Swagger bullets already
there).

- [ ] **Step 6: Commit, push, open the PR**

```bash
git add .changeset/bff-session-auth.md docs/runbooks/bff-session-auth-migration.md AGENTS.md apps/client/e2e
git commit -m "docs: changeset + runbook for BFF session auth migration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push -u origin feature/bff-session-auth
gh pr create --base dev --title "feat: BFF server-side session auth (opaque cookie, no client-visible tokens)" --body "..."
```

Per `AGENTS.md`: **stop here.** Report the PR link and CI status. Never
merge autonomously — the user reviews and merges by hand.

---

## Self-Review

**Spec coverage:**
- `SessionStore` interface + Redis/Fake impls → Tasks 1–2. ✅
- `AuthGuard` cookie resolution + distributed-lock refresh + 401-vs-503
  distinction → Task 4. ✅
- CSRF-everywhere → Task 6. ✅
- Session revocation (logout ordering, admin kick, role-change note) →
  Tasks 5 (logout) & 7 (admin). Role-change invalidation itself (calling
  `deleteAllForUser` from inside `setRole()`'s call site) is **not** a
  separate task — it belongs wherever `AuthStrategy.setRole()` is currently
  invoked from an admin endpoint; add one line there
  (`await sessionStore.deleteAllForUser(uid)` after the existing
  `authClient.setRole(...)` call) as part of Task 7's commit, not a new task.
- Frontend migration → Task 8. ✅
- Per-provider verification → Task 9. ✅
- Testing section (contract tests, guard unit tests, live E2E) → spread
  across Tasks 1, 2, 4, 6, 9, 10. ✅
- Migration/rollout (clean cutover) → captured in Global Constraints +
  Task 10's runbook, no dedicated task needed since it is a policy
  decision, not a code change.

**Placeholder scan:** no TBD/TODO left; Task 9's provider-specific
integration test is deliberately marked "match this strategy's existing
setup" rather than fabricating fixture code the author hasn't seen — that
is a pointer to a real, existing file to copy from, not a placeholder for
missing logic.

**Type consistency:** `SessionRecord`/`SessionStore`/`NewSessionRecord`
(Task 1) used identically in `FakeSessionStore` (Task 1), `RedisSessionStore`
(Task 2), `AuthGuard` (Task 4), and `AuthController` (Task 5). `SESSION_STORE`
token (Task 3) is the sole injection point used by both. `VerifiedToken`
shape (`{ uid, email, role }`) unchanged from the pre-existing
`libs/shared/src/strategies/auth.ts` interface — `req.user` stays
compatible with anything downstream that already reads it.

## Scope Note

This plan is intentionally kept as ten tasks in one file rather than split
into independent sub-plans, per the user's explicit ask for a single
visible plan covering all platforms. Tasks 1–7 (backend) are still safely
executable as one linear sequence; Task 8 (frontend) and Task 9
(per-provider live checks) could run in parallel with each other once
Task 7 lands, if execution speed matters more than strict linear review.
