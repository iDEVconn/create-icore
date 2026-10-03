# Optional in-memory session store (no Redis for small projects) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scaffolded project can run its gateway sessions without Redis: `create-icore --session=memory` sets `SESSION_STORE=memory`, and when nothing else needs Redis (no BullMQ, transport not `redis`) the generated `docker-compose.yml` drops the Redis service.

**Architecture:** A real `InMemorySessionStore` (libs/shared) implements the existing `SessionStore` contract with expiry; the gateway's `sessionStoreProvider` selects it via `SESSION_STORE=redis|memory` (default `redis`, so nothing changes for existing deployments) with a loud warning and a production acknowledgment (`SESSION_STORE_ALLOW_MEMORY=true`). The generator gains a `session` option (flag, config key, wizard question) that rewrites the gateway `.env` and compose.

**Tech Stack:** NestJS 11, Vitest, `@icore/shared`, create-icore CLI (`@clack/prompts`), Docker compose text rewriting.

**Spec:** `docs/superpowers/specs/2026-10-03-session-store-memory-design.md`

## Global Constraints

- Branch `feature/session-store-memory` (spec already committed there); PR base is **always** `--base dev`; never merge; wait for CI and report.
- Test one project: `yarn nx test <proj> -- <filter>`; for `create-icore` use `yarn nx test create-icore --testFile=<name>`. Never rely on `task-done` running tests only: for tasks touching shared types the completion command must be `yarn nx run-many -t lint test build -p <projects>`.
- Before every commit `npx prettier --write` ONLY the files you touched (never a whole `apps/templates`); `git add` explicit paths (never `git add docs` wholesale — an untracked `docs/live-testing-supabase-accounts.md` belongs to the user). After any `nx build create-icore` / snapshot run: `git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json` before `git add`. Scaffold smoke needs snapshot + smoke **back to back** (do not revert templates in between).
- zsh does not word-split unquoted variables: pass flags as literal arguments (`run --auth=… --db=…`), never `$flags`.
- Default behaviour must not change: `SESSION_STORE` unset ⇒ `redis`; `--session` omitted in a config file ⇒ `redis`.
- `.changeset/session-store-memory.md` (`'@idevconn/create-icore': minor`) is required.

## Review Focus

- **Production guard:** `NODE_ENV=production` + `SESSION_STORE=memory` without `SESSION_STORE_ALLOW_MEMORY=true` must refuse to boot; only the exact string `true` counts (Task 2).
- **Expiry:** an expired session must behave as absent for `get`, `update` (→ `false`, never resurrected), `delete` (→ `null`) and `deleteAllForUser` (not returned); the sweep timer must not keep the process alive (`unref`) (Task 1).
- **Lock:** `withRefreshLock` must release when `fn` throws and give up with `session_refresh_lock_timeout` after the wait cap (Task 1).
- **Compose:** `memory` keeps the Redis service when `jobs=bullmq` OR `transport=redis`; removes it (service, `icore_redis_data` volume, every `depends_on: redis`) only when nothing needs it; `auth=none` leaves compose untouched; `redis` leaves it untouched (Task 4).
- **Defaults:** omitted `session` ⇒ `redis` through flags, config file and wizard; the wizard question is skipped for `auth=none` (Task 3).

---

### Task 1: `InMemorySessionStore`

**Files:**

- Create: `libs/shared/src/session/in-memory-session-store.ts`
- Create: `libs/shared/src/session/__tests__/in-memory-session-store.unit.test.ts`
- Modify: `libs/shared/src/index.ts` (export)

**Interfaces:**

- Produces: `class InMemorySessionStore implements SessionStore` with `constructor(options?: InMemorySessionStoreOptions)`, `close(): void` and `get size(): number`; `interface InMemorySessionStoreOptions { sessionTtlMs?: number; sweepIntervalMs?: number; lockMaxWaitMs?: number; now?: () => number }` (defaults: 30 days, 10 min — `0` disables the sweep, 20 s, `Date.now`).

- [ ] **Step 1: Write the failing tests** — `in-memory-session-store.unit.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemorySessionStore } from '../in-memory-session-store';
import { runSessionStoreContract } from './session-store.contract';

// Same suite Redis and the Fake pass. No sweep timer in the contract run.
runSessionStoreContract(
  'InMemorySessionStore',
  () => new InMemorySessionStore({ sweepIntervalMs: 0 }),
);

const record = {
  uid: 'u1',
  email: 'a@x.com',
  providerAccessToken: 'at1',
  providerRefreshToken: 'rt1',
  providerAccessTokenExpiresAt: 1,
};
const DAY = 24 * 60 * 60 * 1000;

describe('InMemorySessionStore — expiry', () => {
  it('a session is gone 30 days after its last create/update (lazily, on read)', async () => {
    let t = 1_000_000;
    const store = new InMemorySessionStore({ sweepIntervalMs: 0, now: () => t });
    const created = await store.create(record);
    t += 29 * DAY;
    expect(await store.get(created.sessionId)).not.toBeNull();
    await store.update(created.sessionId, { providerAccessToken: 'at2' }); // sliding TTL
    t += 29 * DAY;
    expect(await store.get(created.sessionId)).not.toBeNull();
    t += 2 * DAY;
    expect(await store.get(created.sessionId)).toBeNull();
  });

  it('an expired session behaves as absent everywhere and is never resurrected', async () => {
    let t = 1_000_000;
    const store = new InMemorySessionStore({ sweepIntervalMs: 0, now: () => t });
    const created = await store.create(record);
    t += 31 * DAY;
    expect(await store.update(created.sessionId, { providerAccessToken: 'x' })).toBe(false);
    expect(await store.get(created.sessionId)).toBeNull();
    expect(await store.delete(created.sessionId)).toBeNull();
    expect(await store.deleteAllForUser('u1')).toEqual([]);
  });

  it('the periodic sweep drops expired sessions without any read', async () => {
    vi.useFakeTimers();
    try {
      const store = new InMemorySessionStore({ sweepIntervalMs: 1000 });
      await store.create(record);
      expect(store.size).toBe(1);
      await vi.advanceTimersByTimeAsync(31 * DAY);
      expect(store.size).toBe(0); // swept, never read
      store.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('InMemorySessionStore — withRefreshLock', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let store: InMemorySessionStore;
  afterEach(() => store?.close());

  it('serialises callers for the same session id; other ids are independent', async () => {
    store = new InMemorySessionStore({ sweepIntervalMs: 0 });
    const events: string[] = [];
    const a = store.withRefreshLock('s1', async () => {
      events.push('A:in');
      await sleep(50);
      events.push('A:out');
    });
    const b = store.withRefreshLock('s1', async () => {
      events.push('B:in');
    });
    const other = store.withRefreshLock('s2', async () => {
      events.push('other');
    });
    await Promise.all([a, b, other]);
    expect(events.indexOf('A:out')).toBeLessThan(events.indexOf('B:in'));
    expect(events.indexOf('other')).toBeLessThan(events.indexOf('A:out'));
  });

  it('releases the lock when the holder throws', async () => {
    store = new InMemorySessionStore({ sweepIntervalMs: 0 });
    await expect(
      store.withRefreshLock('s1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(store.withRefreshLock('s1', async () => 'ok')).resolves.toBe('ok');
  });

  it('gives up with session_refresh_lock_timeout when the holder outlives the wait cap, without breaking the queue', async () => {
    store = new InMemorySessionStore({ sweepIntervalMs: 0, lockMaxWaitMs: 40 });
    const holder = store.withRefreshLock('s1', () => sleep(150));
    await sleep(5);
    await expect(store.withRefreshLock('s1', async () => 'late')).rejects.toThrow(
      'session_refresh_lock_timeout: s1',
    );
    await holder;
    await expect(store.withRefreshLock('s1', async () => 'after')).resolves.toBe('after');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `yarn nx test shared -- in-memory-session-store`. Expected: FAIL (`Cannot find module '../in-memory-session-store'`).

- [ ] **Step 3: Implement** `in-memory-session-store.ts`:

```ts
import type { NewSessionRecord, SessionRecord, SessionStore } from './session-store';

// Matches RedisSessionStore's SESSION_TTL_SECONDS: the provider refresh token
// is the real expiry authority (30 days), so a session idle that long is dead.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const LOCK_MAX_WAIT_MS = 20_000;

export interface InMemorySessionStoreOptions {
  sessionTtlMs?: number;
  /** 0 disables the periodic sweep (reads still expire lazily). */
  sweepIntervalMs?: number;
  lockMaxWaitMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface Entry {
  record: SessionRecord;
  expiresAt: number;
}

/**
 * Sessions held in THIS process. For small, single-instance projects that do
 * not want a Redis service: a restart logs everyone out and a second gateway
 * instance would not see these sessions. Selected with SESSION_STORE=memory
 * (see sessionStoreProvider, which warns loudly and guards production).
 *
 * Same guarantees as RedisSessionStore: update() never resurrects a session,
 * delete()/deleteAllForUser() return the records as they were at deletion, and
 * withRefreshLock() is single-flight per session id. Unlike the test-only
 * FakeSessionStore it EXPIRES sessions, otherwise a long-lived process would
 * accumulate dead records forever.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly entries = new Map<string, Entry>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly ttlMs: number;
  private readonly lockMaxWaitMs: number;
  private readonly now: () => number;
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;

  constructor(options: InMemorySessionStoreOptions = {}) {
    this.ttlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
    this.lockMaxWaitMs = options.lockMaxWaitMs ?? LOCK_MAX_WAIT_MS;
    this.now = options.now ?? Date.now;
    const sweepMs = options.sweepIntervalMs ?? SWEEP_INTERVAL_MS;
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
      this.sweepTimer.unref?.(); // never keep the process alive for housekeeping
    } else {
      this.sweepTimer = null;
    }
  }

  /** Stored entries (including not-yet-swept expired ones); for tests/diagnostics. */
  get size(): number {
    return this.entries.size;
  }

  close(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async create(record: NewSessionRecord): Promise<SessionRecord> {
    const now = this.now();
    const full: SessionRecord = {
      ...record,
      sessionId: globalThis.crypto.randomUUID(),
      createdAt: now,
      lastRefreshedAt: now,
    };
    this.entries.set(full.sessionId, { record: full, expiresAt: now + this.ttlMs });
    return full;
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    return this.live(sessionId)?.record ?? null;
  }

  async update(sessionId: string, patch: Partial<SessionRecord>): Promise<boolean> {
    const entry = this.live(sessionId);
    if (!entry) return false;
    const now = this.now();
    this.entries.set(sessionId, {
      record: { ...entry.record, ...patch, lastRefreshedAt: now },
      expiresAt: now + this.ttlMs,
    });
    return true;
  }

  async delete(sessionId: string): Promise<SessionRecord | null> {
    const entry = this.live(sessionId);
    this.entries.delete(sessionId);
    return entry?.record ?? null;
  }

  async deleteAllForUser(uid: string): Promise<SessionRecord[]> {
    const deleted: SessionRecord[] = [];
    for (const [id, entry] of this.entries) {
      if (entry.record.uid !== uid) continue;
      this.entries.delete(id);
      if (entry.expiresAt > this.now()) deleted.push(entry.record);
    }
    return deleted;
  }

  async withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => mine);
    this.locks.set(sessionId, tail);
    try {
      await this.waitFor(previous, sessionId);
      return await fn();
    } finally {
      release();
      if (this.locks.get(sessionId) === tail) this.locks.delete(sessionId);
    }
  }

  private waitFor(previous: Promise<void>, sessionId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`session_refresh_lock_timeout: ${sessionId}`)),
        this.lockMaxWaitMs,
      );
      void previous.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private live(sessionId: string): Entry | null {
    const entry = this.entries.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(sessionId);
      return null;
    }
    return entry;
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
  }
}
```

Add `export * from './session/in-memory-session-store';` to `libs/shared/src/index.ts` (next to the other session exports).

- [ ] **Step 4: Run to verify it passes** — `yarn nx test shared`. Expected: PASS (contract suite for the new store, expiry, lock cases; all existing).

- [ ] **Step 5: Commit**

```bash
npx prettier --write libs/shared/src/session libs/shared/src/index.ts
git add libs/shared/src/session libs/shared/src/index.ts
git commit -m "feat(shared): InMemorySessionStore (expiring, single-flight lock) for Redis-less deployments"
```

---

### Task 2: Gateway provider — `SESSION_STORE` switch + production guard

**Files:**

- Modify: `apps/api/src/app/session/session-store.provider.ts`
- Create: `apps/api/src/app/session/__tests__/session-store.provider.unit.test.ts`
- Modify: `apps/api/.env.example` (comment + `SESSION_STORE` doc lines)

**Interfaces:**

- Consumes: `InMemorySessionStore` (Task 1).
- Produces: env contract `SESSION_STORE=redis|memory` (default `redis`), `SESSION_STORE_ALLOW_MEMORY=true` (production acknowledgment).

- [ ] **Step 1: Write the failing tests**:

```ts
import { Logger, type FactoryProvider } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InMemorySessionStore, type SessionStore } from '@icore/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionStoreProvider } from '../session-store.provider';

const factory = (sessionStoreProvider as FactoryProvider<SessionStore>).useFactory;
const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

describe('sessionStoreProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to redis: without SESSION_REDIS_URL it refuses to boot and points at SESSION_STORE=memory', () => {
    expect(() => factory(cfg({}))).toThrow(/SESSION_REDIS_URL is required.*SESSION_STORE=memory/s);
  });

  it('rejects an unknown SESSION_STORE value and names the accepted ones', () => {
    expect(() => factory(cfg({ SESSION_STORE: 'dynamodb' }))).toThrow(/redis.*memory/s);
  });

  it('memory (development): returns an InMemorySessionStore and warns loudly', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const store = factory(cfg({ SESSION_STORE: 'memory' }));
    expect(store).toBeInstanceOf(InMemorySessionStore);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(
      /restart logs everyone out.*ONE gateway instance/s,
    );
    (store as InMemorySessionStore).close();
  });

  it('memory in production without SESSION_STORE_ALLOW_MEMORY=true refuses to boot', () => {
    expect(() => factory(cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production' }))).toThrow(
      /SESSION_STORE_ALLOW_MEMORY=true/,
    );
  });

  it.each(['1', 'yes', 'TRUE', ''])(
    'only the exact string "true" acknowledges memory in production (got %j)',
    (ack) => {
      expect(() =>
        factory(
          cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production', SESSION_STORE_ALLOW_MEMORY: ack }),
        ),
      ).toThrow(/SESSION_STORE_ALLOW_MEMORY=true/);
    },
  );

  it('memory in production WITH the acknowledgment boots (and still warns)', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const store = factory(
      cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production', SESSION_STORE_ALLOW_MEMORY: 'true' }),
    );
    expect(store).toBeInstanceOf(InMemorySessionStore);
    expect(warn).toHaveBeenCalled();
    (store as InMemorySessionStore).close();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `yarn nx test api -- session-store.provider`. Expected: FAIL (memory branch and new messages don't exist).

- [ ] **Step 3: Implement.** Rewrite the factory body of `session-store.provider.ts`:

```ts
import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { InMemorySessionStore, RedisSessionStore, type SessionStore } from '@icore/shared';

export const SESSION_STORE = Symbol('SESSION_STORE');

export const sessionStoreProvider: Provider = {
  provide: SESSION_STORE,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): SessionStore => {
    const logger = new Logger('SessionStore');
    const kind = (cfg.get<string>('SESSION_STORE') ?? 'redis').toLowerCase();

    if (kind === 'memory') {
      // Explicit opt-in for small, single-instance projects. Never silent: a
      // restart logs every user out and a second instance would not see these
      // sessions, so production needs a second, deliberate acknowledgment.
      if (cfg.get<string>('NODE_ENV') === 'production' && cfg.get<string>('SESSION_STORE_ALLOW_MEMORY') !== 'true') {
        throw new Error(
          'SESSION_STORE=memory in production needs SESSION_STORE_ALLOW_MEMORY=true — sessions live in this process only (a restart logs everyone out; run exactly ONE gateway instance). Set SESSION_STORE=redis for anything else.',
        );
      }
      logger.warn(
        'SESSION_STORE=memory: sessions live in this process — a restart logs everyone out and only ONE gateway instance may run. Use SESSION_STORE=redis for anything else.',
      );
      return new InMemorySessionStore();
    }
    if (kind !== 'redis') {
      throw new Error(`Unknown SESSION_STORE "${kind}" — expected "redis" (default) or "memory".`);
    }

    const url = cfg.get<string>('SESSION_REDIS_URL');
    if (!url) {
      throw new Error(
        'SESSION_REDIS_URL is required when SESSION_STORE=redis (the default). To run without Redis, set SESSION_STORE=memory (single instance; a restart logs everyone out) — see docs/runbooks/bff-session-auth-migration.md.',
      );
    }
    // (keep the existing request-path IORedis comment block + client options + RedisSessionStore return unchanged)
```

Keep the existing `const redis = new IORedis(url, {...}); redis.on('error', …); return new RedisSessionStore(redis);` lines and their explanatory comment exactly as they are.

In `apps/api/.env.example` replace the comment block above `SESSION_REDIS_URL` with:

```
# Session store for the BFF auth model: the gateway's OWN session storage for
# opaque session cookies (distinct from AUTH_REDIS_URL, which is an optional
# gateway<->auth-MS message transport).
#   SESSION_STORE=redis   (default) needs SESSION_REDIS_URL below — use this for anything that
#                          runs more than one gateway instance or must survive restarts.
#   SESSION_STORE=memory  no Redis service: sessions live in this process, a restart logs
#                          everyone out, only ONE gateway instance may run. In production it
#                          additionally needs SESSION_STORE_ALLOW_MEMORY=true.
SESSION_REDIS_URL=redis://localhost:6379
```

- [ ] **Step 4: Run to verify it passes** — `yarn nx test api` (all green incl. the new file); `yarn nx run-many -t lint build -p api`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/session apps/api/.env.example
git add apps/api/src/app/session apps/api/.env.example
git commit -m "feat(api): SESSION_STORE=redis|memory switch with a production acknowledgment guard"
```

---

### Task 3: Generator option — `session` (flag, config, wizard, validation)

**Files:**

- Modify: `tools/create-icore/src/lib/options.ts`, `config.ts`, `prompts.ts`
- Modify (tests): `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`, `config.unit.test.ts`, `validate-options.unit.test.ts` (+ any typed `CreateIcoreOptions` fixture that now needs `session`)

**Interfaces:**

- Produces: `type SessionStoreKind = 'redis' | 'memory'`; `CreateIcoreOptions.session: SessionStoreKind`; `parseFlags` reads `--session=<v>`; config key `session`; `validateOptions` normalises `auth=none` ⇒ `session: 'redis'` + warning when `memory` was requested.

- [ ] **Step 1: Write the failing tests.** `prompts.unit.test.ts` (add to `parseFlags`/`collectOptions` describes; the file already mocks `@clack/prompts`):

```ts
it('reads --session=memory', () => {
  expect(parseFlags(['my-app', '--session=memory']).session).toBe('memory');
});
```

and in the `collectOptions` describe (using the existing `baseArgv` pattern, auth NOT none so the question would be asked):

```ts
describe('collectOptions — session store', () => {
  const argv = (extra: string[]) => [
    'my-app',
    '--auth=supabase',
    '--db=supabase',
    '--upload=none',
    '--payment=none',
    '--jobs=none',
    '--ai=none',
    '--example=none',
    '--ui=shadcn',
    '--transport=tcp',
    '--package-manager=yarn',
    '--no-git',
    '--no-install',
    ...extra,
  ];

  it('takes --session without asking', async () => {
    const opts = await collectOptions({ argv: argv(['--session=memory']), cwd: '.' });
    expect(opts.session).toBe('memory');
  });

  it('does not ask for a session store when auth=none (there are no sessions) and uses redis', async () => {
    const opts = await collectOptions({
      argv: [
        'my-app',
        '--auth=none',
        '--upload=none',
        '--payment=none',
        '--jobs=none',
        '--ai=none',
        '--ui=shadcn',
        '--transport=tcp',
        '--package-manager=yarn',
        '--no-git',
        '--no-install',
      ],
      cwd: '.',
    });
    expect(opts.session).toBe('redis');
  });
});
```

`config.unit.test.ts`: `validateConfig({ session: 'memory' })` → `{ session: 'memory' }`; `validateConfig({ session: 'dynamo' })` throws `ConfigFileError` mentioning `redis, memory`. `validate-options.unit.test.ts`: add `session: 'redis'` to its typed `base`, then:

```ts
it('ignores --session=memory when auth=none (no sessions at all) and says so', () => {
  const { warnings, corrected } = validateOptions({
    ...base,
    authProvider: 'none' as const,
    example: 'none' as const,
    session: 'memory' as const,
  });
  expect(corrected.session).toBe('redis');
  expect(warnings.join(' ')).toMatch(/session.*auth=none|auth=none.*session/i);
});

it('keeps session=memory for an authenticated project', () => {
  expect(validateOptions({ ...base, session: 'memory' as const }).corrected.session).toBe('memory');
});
```

- [ ] **Step 2: Run to verify it fails** — `yarn nx test create-icore --testFile=prompts`, `--testFile=config`, `--testFile=validate-options`. Expected: FAIL.

- [ ] **Step 3: Implement.** `options.ts`: add `export type SessionStoreKind = 'redis' | 'memory';`, `session: SessionStoreKind;` in `CreateIcoreOptions` (after `transport`), and in `validateOptions` before `return`:

```ts
if (opts.authProvider === 'none' && opts.session !== 'redis') {
  warnings.push('--session has no effect with auth=none (there are no sessions) — ignored');
  corrected = { ...corrected, session: 'redis' };
}
```

`config.ts`: `const SESSION_STORES: readonly SessionStoreKind[] = ['redis', 'memory'];` (import the type) and `if ('session' in obj) result.session = assertEnum('session', obj['session'], SESSION_STORES);`. `prompts.ts`: import `SessionStoreKind`; in `parseFlags` add `case 'session': out.session = v as SessionStoreKind; break;`; in `collectOptions`, after the transport question:

```ts
const session: SessionStoreKind =
  flags.session ??
  (authProvider === 'none'
    ? 'redis'
    : ((await p.select({
        message: 'Where should login sessions be stored?',
        options: [
          {
            value: 'redis' as SessionStoreKind,
            label: 'Redis (recommended — survives restarts, several instances)',
          },
          {
            value: 'memory' as SessionStoreKind,
            label: 'In memory (no Redis service; a restart logs everyone out, one instance only)',
          },
        ],
        initialValue: 'redis' as SessionStoreKind,
      })) as SessionStoreKind));
if (p.isCancel(session)) throw new Error('cancelled');
```

and add `session,` to the returned object (next to `transport`). Then run the whole `create-icore` suite and fix every typed `CreateIcoreOptions` fixture the compiler/tests flag by adding `session: 'redis'` (`grep -rn "CreateIcoreOptions = {" tools/create-icore/src`).

- [ ] **Step 4: Run to verify it passes** — `yarn nx run-many -t lint test build -p create-icore`; then `git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write tools/create-icore/src/lib
git add tools/create-icore/src/lib
git commit -m "feat(create-icore): --session=redis|memory option (flag, config file, wizard, validation)"
```

---

### Task 4: Generator output — gateway `.env`, compose, smoke script, pipeline combo

**Files:**

- Modify: `tools/create-icore/src/lib/scaffold-env.ts` (`writeGatewayEnv`; new `rewriteComposeSession`), `tools/create-icore/src/lib/scaffold.ts` (import/export + call), `tools/create-icore/scripts/smoke-scaffold.mjs` (`session: args.session ?? 'redis'`)
- Create: `tools/create-icore/src/lib/__tests__/scaffold-compose-session.unit.test.ts`
- Modify: `tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts` (gateway env case)
- Modify: `.github/workflows/pipeline.yml` (add `--session=memory` to the `no-upload` smoke combo)

**Interfaces:**

- Consumes: `opts.session`, `opts.jobs`, `opts.transport`, `opts.authProvider`.
- Produces: `rewriteComposeSession(targetDir: string, opts: CreateIcoreOptions): Promise<void>`.

- [ ] **Step 1: Write the failing tests.** `scaffold-compose-session.unit.test.ts` (real repo compose, same pattern as `scaffold-compose-transport.unit.test.ts`; run `rewriteComposeTransport` first like the scaffolder does):

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteComposeSession, rewriteComposeTransport } from '../scaffold-env.js';
import type { CreateIcoreOptions } from '../options.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

async function compose(over: Partial<CreateIcoreOptions>): Promise<string> {
  const opts = {
    authProvider: 'supabase',
    transport: 'tcp',
    jobs: 'none',
    session: 'redis',
    ...over,
  } as CreateIcoreOptions;
  const dir = await mkdtemp(join(tmpdir(), 'icore-compose-session-'));
  await copyFile(join(repoRoot, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
  await rewriteComposeTransport(dir, opts);
  await rewriteComposeSession(dir, opts);
  return readFile(join(dir, 'docker-compose.yml'), 'utf8');
}

describe('rewriteComposeSession', () => {
  it('redis: leaves the compose untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-compose-session-'));
    await copyFile(join(repoRoot, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
    const before = await readFile(join(dir, 'docker-compose.yml'), 'utf8');
    await rewriteComposeSession(dir, {
      authProvider: 'supabase',
      transport: 'tcp',
      jobs: 'none',
      session: 'redis',
    } as CreateIcoreOptions);
    expect(await readFile(join(dir, 'docker-compose.yml'), 'utf8')).toBe(before);
  });

  it('memory + nothing else needing Redis: gateway runs in-memory and the Redis service, volume and every depends_on are gone', async () => {
    const c = await compose({ session: 'memory' });
    expect(c).toContain('SESSION_STORE: memory');
    expect(c).toContain("SESSION_STORE_ALLOW_MEMORY: 'true'");
    expect(c).not.toContain('SESSION_REDIS_URL');
    expect(c).not.toMatch(/\n {2}redis:\n/);
    expect(c).not.toContain('icore_redis_data');
    expect(c).not.toMatch(/depends_on:\n(?: {6}.*\n)*? {6}redis:/);
    expect(c).not.toContain('redis:7-alpine');
  });

  it('memory + jobs=bullmq: the Redis service STAYS (BullMQ needs it) but the gateway still skips Redis for sessions', async () => {
    const c = await compose({ session: 'memory', jobs: 'bullmq' });
    expect(c).toContain('SESSION_STORE: memory');
    expect(c).not.toContain('SESSION_REDIS_URL');
    expect(c).toMatch(/\n {2}redis:\n/);
    expect(c).toContain('icore_redis_data');
  });

  it('memory + transport=redis: the Redis service STAYS (the transport needs it)', async () => {
    const c = await compose({ session: 'memory', transport: 'redis' });
    expect(c).toContain('SESSION_STORE: memory');
    expect(c).toMatch(/\n {2}redis:\n/);
  });

  it('auth=none: compose untouched even with session=memory (there are no sessions)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-compose-session-'));
    await copyFile(join(repoRoot, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
    const before = await readFile(join(dir, 'docker-compose.yml'), 'utf8');
    await rewriteComposeSession(dir, {
      authProvider: 'none',
      transport: 'tcp',
      jobs: 'none',
      session: 'memory',
    } as CreateIcoreOptions);
    expect(await readFile(join(dir, 'docker-compose.yml'), 'utf8')).toBe(before);
  });

  it('is a no-op when docker-compose.yml is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-compose-session-'));
    await expect(
      rewriteComposeSession(dir, {
        authProvider: 'supabase',
        transport: 'tcp',
        jobs: 'none',
        session: 'memory',
      } as CreateIcoreOptions),
    ).resolves.toBeUndefined();
  });
});
```

`scaffold-env.unit.test.ts` (gateway env; use a fixture `apps/api/.env.example` containing `SESSION_REDIS_URL=redis://localhost:6379` and the `*_TRANSPORT` lines — mirror the existing `writeGatewayEnv` fixture if one exists, else build one):

```ts
it('writeGatewayEnv: session=memory swaps SESSION_REDIS_URL for SESSION_STORE=memory; redis leaves it', async () => {
  const mk = async (session: 'redis' | 'memory') => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-gwenv-'));
    await mkdir(join(dir, 'apps/api'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/.env.example'),
      'AUTH_TRANSPORT=tcp\nSESSION_REDIS_URL=redis://localhost:6379\n',
    );
    await writeGatewayEnv(dir, {
      authProvider: 'supabase',
      transport: 'tcp',
      session,
    } as CreateIcoreOptions);
    return readFile(join(dir, 'apps/api/.env'), 'utf8');
  };
  const mem = await mk('memory');
  expect(mem).toContain('SESSION_STORE=memory');
  expect(mem).not.toContain('SESSION_REDIS_URL');
  const redis = await mk('redis');
  expect(redis).toContain('SESSION_REDIS_URL=redis://localhost:6379');
  expect(redis).not.toContain('SESSION_STORE=');
});
```

(import `writeGatewayEnv` and the fs helpers if the file lacks them.)

- [ ] **Step 2: Run to verify it fails** — `yarn nx test create-icore --testFile=scaffold-compose-session` and `--testFile=scaffold-env`. Expected: FAIL (`rewriteComposeSession` not exported; env unchanged).

- [ ] **Step 3: Implement.** In `writeGatewayEnv`, right after the transport/uncomment loop add:

```ts
if (opts.session === 'memory' && opts.authProvider !== 'none') {
  next = next.replace(/^SESSION_REDIS_URL=.*$/m, 'SESSION_STORE=memory');
}
```

Append to `scaffold-env.ts`:

```ts
/**
 * --session=memory: the gateway keeps sessions in-process (SESSION_STORE=memory)
 * instead of in Redis. In docker-compose that means: gateway env switches, and —
 * only if nothing else needs Redis (no BullMQ, transport is not `redis`) — the
 * Redis service, its volume and every `depends_on: redis` are removed.
 * Choosing `memory` at generation time IS the explicit acknowledgment production
 * needs, so the container (NODE_ENV=production) gets SESSION_STORE_ALLOW_MEMORY.
 * auth=none has no sessions at all: untouched. Run AFTER rewriteComposeTransport
 * and the strip passes.
 */
export async function rewriteComposeSession(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  if (opts.session !== 'memory' || opts.authProvider === 'none') return;
  const composePath = join(targetDir, 'docker-compose.yml');
  let compose: string;
  try {
    compose = await readFile(composePath, 'utf8');
  } catch {
    return;
  }
  compose = compose.replace(
    / {6}# BFF session store[\s\S]*?SESSION_REDIS_URL: [^\n]*/,
    `      # --session=memory: sessions live in the gateway process (no Redis for them).\n` +
      `      # A restart logs everyone out; run exactly ONE gateway instance.\n` +
      `      SESSION_STORE: memory\n` +
      `      SESSION_STORE_ALLOW_MEMORY: 'true'`,
  );
  const redisStillNeeded = opts.jobs === 'bullmq' || opts.transport === 'redis';
  if (!redisStillNeeded) {
    compose = compose
      .replace(/\n {2}redis:\n(?: {4}[^\n]*\n)*? {4}networks: \[icore\]\n/, '\n')
      .replace(/\n {6}redis:\n {8}condition: service_healthy/g, '')
      .replace(/\n {2}icore_redis_data:/, '');
  }
  await writeFile(composePath, compose);
}
```

In `scaffold.ts` add `rewriteComposeSession` to the import list and the re-export block (next to `rewriteComposeTransport`) and call `await rewriteComposeSession(opts.targetDir, opts);` immediately after the existing `await rewriteComposeTransport(...)` line. In `smoke-scaffold.mjs` add `session: args.session ?? 'redis',` to the options object next to `transport: args.transport ?? 'tcp',` (and mention `--session=memory` in the usage comment). In `pipeline.yml`, append ` --session=memory` to the `no-upload` combo's flags line (auth=firebase … transport=tcp; keep it in shard 1). **Verify the regexes against the real compose output** with a throw-away print in the test run if a case fails (the redis block ends with `networks: [icore]`; the gateway comment block starts `# BFF session store`).

- [ ] **Step 4: Run to verify it passes** — `yarn nx run-many -t lint test build -p create-icore`; discard template drift.

- [ ] **Step 5: Commit**

```bash
npx prettier --write tools/create-icore/src/lib .github/workflows/pipeline.yml
node -e "require('js-yaml')" 2>/dev/null; python3 -c "import yaml;yaml.safe_load(open('.github/workflows/pipeline.yml'))"
git add tools/create-icore/src/lib tools/create-icore/scripts/smoke-scaffold.mjs .github/workflows/pipeline.yml
git commit -m "feat(create-icore): --session=memory rewrites the gateway .env and drops Redis from compose when unused"
```

---

### Task 5: Prove it boots without Redis (install-mode smoke + nightly combo)

**Files:**

- Modify: `.github/workflows/scaffold-smoke-matrix.yml` (one memory combo)

- [ ] **Step 1: Add the combo** to the matrix `combo:` list:

```yaml
- name: supabase-minimal-tcp-memory-shadcn
  flags: --auth=supabase --db=supabase --upload=none --payment=none --jobs=none --example=notes --transport=tcp --ui=shadcn --session=memory
```

- [ ] **Step 2: Local install-mode run, no Redis anywhere** (snapshot + smoke back to back; literal flags, no variable):

```bash
yarn nx build create-icore >/dev/null 2>&1; node tools/create-icore/scripts/snapshot-templates.mjs >/dev/null 2>&1
node tools/create-icore/scripts/smoke-scaffold.mjs --auth=supabase --db=supabase --upload=none --payment=none --jobs=none --example=notes --transport=tcp --ui=shadcn --session=memory --pm=pnpm --mode=install --run --run-seconds=120 --projects=shared,auth,upload,notes,payment,jobs,ai-orchestrator,api,client --services=api,auth,notes > /tmp/claude-1000/memory-smoke.log 2>&1
git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json
```

Expected: `✓ smoke OK`; in the log the gateway prints the `SESSION_STORE=memory` warning and **no** Redis connection errors. Also open the scaffolded project's `docker-compose.yml` (path is printed) and confirm there is no `redis` service. Record the result in the ledger (and any deviation as a `Ruling:`).

- [ ] **Step 3: Commit**

```bash
npx prettier --write .github/workflows/scaffold-smoke-matrix.yml
python3 -c "import yaml;yaml.safe_load(open('.github/workflows/scaffold-smoke-matrix.yml'))"
git add .github/workflows/scaffold-smoke-matrix.yml
git commit -m "ci: nightly scaffold smoke covers --session=memory (boots without Redis)"
```

---

### Task 6: Documentation, changeset, full verification, PR

**Files (all of them — this is the explicit docs task):**

- Modify: `docs/runbooks/bff-session-auth-migration.md`, `docs/runbooks/local-docker.md`, `README.md`, `tools/create-icore/README.md`, `AGENTS.md`, `docs/architecture.md`, `tools/create-icore/src/lib/scaffold-pkg.ts` (generated README), `docs/superpowers/specs/2026-10-03-session-store-memory-design.md` (record rulings)
- Create: `.changeset/session-store-memory.md`

- [ ] **Step 1: Failing test for the generated README.** Extend `scaffold-readme-email-setup.unit.test.ts`'s pattern (or add `scaffold-readme-session.unit.test.ts`) — `writeAiFiles` output for `session: 'memory'` must contain a `## Session store` section mentioning `SESSION_STORE=memory`, "one gateway instance" and "restart"; for `redis` it must mention `SESSION_REDIS_URL` and not contain "in memory". Run → FAIL.

- [ ] **Step 2: Implement the README section** in `scaffold-pkg.ts` (next to `emailSetup`): a `sessionNote` string — `redis`: "Sessions are stored in Redis (`SESSION_REDIS_URL` in `apps/api/.env`) …"; `memory`: "Sessions are stored in the gateway process (`SESSION_STORE=memory`): a restart logs everyone out and only ONE gateway instance may run; switch to `SESSION_STORE=redis` + `SESSION_REDIS_URL` when you need either" — emitted only when `authProvider !== 'none'`. Re-run → PASS.

- [ ] **Step 2b: Write the docs** (each statement below must be in the named file):
  - `docs/runbooks/bff-session-auth-migration.md`: new section **"Choosing the session store"** — `SESSION_STORE=redis|memory`, default `redis`, what `memory` gives up (restart ⇒ re-login, one instance), the warning + production acknowledgment (`SESSION_STORE_ALLOW_MEMORY=true`), expiry (30 days sliding), the generator flag; fix the existing "no in-memory fallback / throws at boot if `SESSION_REDIS_URL` is unset" wording to "no _silent_ fallback".
  - `docs/runbooks/local-docker.md`: replace "Redis is **always** in the stack" with the real rule (always for `redis` sessions; removed with `--session=memory` unless `jobs=bullmq` or `transport=redis`), and show the matching compose env.
  - `README.md` + `tools/create-icore/README.md`: add `--session` to the flag table (`redis` default, `memory`), one sentence in the stack/auth rows.
  - `AGENTS.md`: Key Patterns / Important — the `SESSION_STORE` switch and production guard; correct the bullet "Redis is in every scaffold regardless of `--transport`" and the BFF bullet ("requires `SESSION_REDIS_URL`, no in-memory fallback" ⇒ default Redis, opt-in memory); keep the refresh-lock invariants bullet (they apply to both stores).
  - `docs/architecture.md`: link to the new runbook section.
  - Spec: append a "Implementation rulings" list with anything decided during execution.

- [ ] **Step 3: Changeset** `.changeset/session-store-memory.md`:

```md
---
'@idevconn/create-icore': minor
---

New --session=redis|memory option: run login sessions in the gateway process (SESSION_STORE=memory) so small projects need no Redis service; the generated docker-compose drops Redis when nothing else uses it. Default stays redis. Gateway: SESSION_STORE switch, InMemorySessionStore with 30-day expiry, loud warning and a production acknowledgment (SESSION_STORE_ALLOW_MEMORY=true)
```

- [ ] **Step 4: Full verification.** `yarn nx run-many -t lint build -p shared,api,create-icore --parallel=3`; `yarn nx test shared`, `yarn nx test api`, `yarn nx test create-icore`; `yarn install --immutable`; scaffold smoke (link, snapshot + smoke back to back) for supabase/tcp/**memory**, firebase/redis, and postgres combos; `git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json`; confirm `git branch --show-current` is `feature/session-store-memory`.

- [ ] **Step 5: Commit, push, PR** — explicit `git add` paths only; commit `docs: session store memory option — runbooks, READMEs, AGENTS, changeset`; `gh pr list --state all --limit 10`; `git push -u origin feature/session-store-memory`; `gh pr create --base dev` (what/why, rulings, test plan incl. the install-mode memory smoke, the deliberate trade-offs, and the Claude Code attribution line). Report CI; **do not merge**.
