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
