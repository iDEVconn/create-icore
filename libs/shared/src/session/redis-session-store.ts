import type IORedis from 'ioredis';
import type { NewSessionRecord, SessionRecord, SessionStore } from './session-store';

const SESSION_KEY = (id: string) => `session:${id}`;
const USER_SESSIONS_KEY = (uid: string) => `user-sessions:${uid}`;
const LOCK_KEY = (id: string) => `session-lock:${id}`;
const LOCK_TTL_MS = 10_000;
const LOCK_POLL_MS = 50;
// Upper bound on how long a caller waits to ACQUIRE the refresh lock. Redis
// expires the lock itself after LOCK_TTL_MS, so no legitimate holder can keep
// it longer than that -- waiting past a small multiple of the TTL means
// something is wedged (a stalled Redis, a pathological pile-up), and the
// caller is better off failing fast into the gateway's 503 path than hanging
// a request forever, which is what the original `while (true)` did.
const LOCK_MAX_WAIT_MS = LOCK_TTL_MS * 2;
// Sessions never auto-expire from Redis on their own -- the provider refresh
// token is the real expiry authority (30 days, matching the old icore_rt
// cookie's maxAge). Setting the same TTL here means a Redis-side idle
// session is reclaimed at the same point the refresh token would have
// stopped working anyway, instead of living forever as dead weight.
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Atomic lock release: verify ownership before deletion in a single Redis op.
// Prevents TOCTOU race where lock expires between GET and DEL, allowing
// a different caller to acquire it while we still hold a stale delete.
// See: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
const RELEASE_LOCK_LUA = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

export interface RedisSessionStoreOptions {
  /** Max time to wait for the refresh lock before giving up. Defaults to
   *  twice the lock's own TTL; overridable so tests can assert the bound
   *  without waiting 20 seconds. */
  lockMaxWaitMs?: number;
}

export class RedisSessionStore implements SessionStore {
  private readonly lockMaxWaitMs: number;

  constructor(
    private readonly redis: IORedis,
    options: RedisSessionStoreOptions = {},
  ) {
    this.lockMaxWaitMs = options.lockMaxWaitMs ?? LOCK_MAX_WAIT_MS;
  }

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

  async deleteAllForUser(uid: string): Promise<SessionRecord[]> {
    const ids = await this.redis.smembers(USER_SESSIONS_KEY(uid));
    if (ids.length === 0) return [];
    // Read the full records before deleting -- callers (e.g. admin
    // revoke-user) need the provider refresh token to revoke it upstream,
    // and it's gone once the key is deleted. This read step is necessarily
    // sequential/non-atomic (it's just gets, not writes), but the delete
    // batch below still runs as a single atomic multi/exec.
    const records = await Promise.all(ids.map((id) => this.get(id)));
    const deleted = records.filter((record): record is SessionRecord => record !== null);
    const multi = this.redis.multi();
    for (const id of ids) multi.del(SESSION_KEY(id));
    multi.del(USER_SESSIONS_KEY(uid));
    await multi.exec();
    return deleted;
  }

  // Advisory SET-NX-PX lock. Single-Redis deployment (this scaffold's
  // default) makes this sufficient -- see spec's SessionStore section for
  // why a full Redlock would be over-engineering here.
  async withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const key = LOCK_KEY(sessionId);
    const token = globalThis.crypto.randomUUID();
    const deadline = Date.now() + this.lockMaxWaitMs;
    for (;;) {
      const acquired = await this.redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
      if (acquired === 'OK') break;
      if (Date.now() >= deadline) {
        throw new Error(`session_refresh_lock_timeout: ${sessionId}`);
      }
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
    }
    try {
      // Once the lock is acquired, re-read the session -- another caller may
      // have already refreshed it while we were waiting, and callers should
      // see that result, not redundantly refresh again.
      return await fn();
    } finally {
      // Atomic release: verify ownership and delete in a single Lua op to avoid
      // TOCTOU bug where lock expires between GET and DEL.
      await this.redis.eval(RELEASE_LOCK_LUA, 1, key, token);
    }
  }
}
