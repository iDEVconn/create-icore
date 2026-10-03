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
 *
 * Unlike Redis there is no holder TTL: a `fn` that never settles blocks that
 * session's refresh until restart. Callers bound the work done under the lock
 * (the 8 s in-lock RPC caps), and waiters give up after `lockMaxWaitMs`.
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
    let acquired = false;
    try {
      await this.waitFor(previous, sessionId);
      acquired = true;
      return await fn();
    } finally {
      release();
      if (this.locks.get(sessionId) === tail) {
        // A waiter that timed out never held the lock: the previous holder is still
        // running, so later callers must keep queueing behind it, not start fresh.
        if (acquired) this.locks.delete(sessionId);
        else this.locks.set(sessionId, previous);
      }
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
