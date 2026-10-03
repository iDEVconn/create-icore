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

