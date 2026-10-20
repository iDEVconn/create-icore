import type { SessionRecord } from '../session/session-store';
import type { DurableObjectStorageLike } from './durable-object-types';

const SESSION_PREFIX = 's:';
const LOCK_PREFIX = 'l:';
// Same idle lifetime as RedisSessionStore / InMemorySessionStore.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredSession {
  record: SessionRecord;
  expiresAt: number;
}

interface StoredLock {
  token: string;
  expiresAt: number;
}

export interface SessionObjectCoreOptions {
  sessionTtlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

/**
 * The logic of ONE user's sessions, run inside one Durable Object (keyed by uid).
 * A Durable Object is single-threaded, so every method here is atomic with
 * respect to the others; that is what gives `deleteAll` the "returns exactly
 * what it deleted" guarantee and `update` the "never resurrects a session" one.
 * The Worker host wraps this in a `DurableObject` subclass whose RPC methods
 * delegate here, and whose `alarm()` calls `alarm()`.
 */
export class SessionObjectCore {
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly storage: DurableObjectStorageLike,
    options: SessionObjectCoreOptions = {},
  ) {
    this.ttlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  async create(record: SessionRecord): Promise<void> {
    await this.write(record);
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    return (await this.live(sessionId))?.record ?? null;
  }

  async update(sessionId: string, patch: Partial<SessionRecord>): Promise<boolean> {
    const entry = await this.live(sessionId);
    if (!entry) return false;
    // Identity fields never change through a patch.
    const { record } = entry;
    await this.write({
      ...record,
      ...patch,
      sessionId: record.sessionId,
      uid: record.uid,
      createdAt: record.createdAt,
      lastRefreshedAt: this.now(),
    });
    return true;
  }

  async delete(sessionId: string): Promise<SessionRecord | null> {
    const entry = await this.live(sessionId);
    await this.storage.delete(SESSION_PREFIX + sessionId);
    return entry?.record ?? null;
  }

  async deleteAll(): Promise<SessionRecord[]> {
    const all = await this.storage.list<StoredSession>({ prefix: SESSION_PREFIX });
    const now = this.now();
    const deleted = [...all.values()].filter((e) => e.expiresAt > now).map((e) => e.record);
    if (all.size > 0) await this.storage.delete([...all.keys()]);
    return deleted;
  }

  /** Lease: true when `token` now holds the lock for `sessionId` (or already did). */
  async tryLock(sessionId: string, token: string, ttlMs: number): Promise<boolean> {
    const key = LOCK_PREFIX + sessionId;
    const held = await this.storage.get<StoredLock>(key);
    const now = this.now();
    if (held && held.expiresAt > now && held.token !== token) return false;
    await this.storage.put<StoredLock>(key, { token, expiresAt: now + ttlMs });
    return true;
  }

  /** Releases only when `token` still owns the lease (a stale holder never frees a newer one). */
  async unlock(sessionId: string, token: string): Promise<void> {
    const key = LOCK_PREFIX + sessionId;
    const held = await this.storage.get<StoredLock>(key);
    if (held?.token === token) await this.storage.delete(key);
  }

  /** Durable Object alarm: drop expired sessions and locks, reschedule while any remain. */
  async alarm(): Promise<void> {
    const now = this.now();
    const sessions = await this.storage.list<StoredSession>({ prefix: SESSION_PREFIX });
    const expired: string[] = [];
    let next = Infinity;
    for (const [key, entry] of sessions) {
      if (entry.expiresAt <= now) expired.push(key);
      else next = Math.min(next, entry.expiresAt);
    }
    const locks = await this.storage.list<StoredLock>({ prefix: LOCK_PREFIX });
    for (const [key, lock] of locks) if (lock.expiresAt <= now) expired.push(key);
    if (expired.length > 0) await this.storage.delete(expired);
    if (next !== Infinity) await this.storage.setAlarm(next);
  }

  private async write(record: SessionRecord): Promise<void> {
    const expiresAt = this.now() + this.ttlMs;
    await this.storage.put<StoredSession>(SESSION_PREFIX + record.sessionId, { record, expiresAt });
    await this.storage.setAlarm(expiresAt);
  }

  private async live(sessionId: string): Promise<StoredSession | null> {
    const entry = await this.storage.get<StoredSession>(SESSION_PREFIX + sessionId);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      await this.storage.delete(SESSION_PREFIX + sessionId);
      return null;
    }
    return entry;
  }
}

/** The RPC surface of the session Durable Object (what a stub exposes). */
export type SessionObjectStub = Pick<
  SessionObjectCore,
  'create' | 'get' | 'update' | 'delete' | 'deleteAll' | 'tryLock' | 'unlock'
>;
