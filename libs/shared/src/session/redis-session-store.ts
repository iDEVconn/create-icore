import type IORedis from 'ioredis';
import type { NewSessionRecord, SessionRecord, SessionStore } from './session-store';

const SESSION_KEY = (id: string) => `session:${id}`;
const USER_SESSIONS_KEY = (uid: string) => `user-sessions:${uid}`;
const LOCK_KEY = (id: string) => `session-lock:${id}`;
// The lock is released by TTL, so it must outlive everything done while holding
// it. AuthGuard holds it across two bounded RPCs (`refresh` + `verify`, each
// capped at IN_LOCK_RPC_TIMEOUT_MS = 8 s in @icore/auth-client) plus a Redis
// write: ~16 s worst case, hence 30 s. A TTL shorter than the work lets a
// parallel request in, which then refreshes with an already-rotated token.
const LOCK_TTL_MS = 30_000;
const LOCK_POLL_MS = 50;
// Upper bound on how long a caller waits to ACQUIRE the refresh lock. A healthy
// holder finishes in well under a second and a stuck one is cut off by the RPC
// timeouts, so waiting past this means something is wedged (a stalled Redis, a
// pathological pile-up) and the caller is better off failing fast into the
// gateway's 503 path than hanging a request forever.
const LOCK_MAX_WAIT_MS = 20_000;
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
  /** Max time to wait for the refresh lock before giving up (default 20 s);
   *  overridable so tests can assert the bound without waiting that long. */
  lockMaxWaitMs?: number;
  /** How long an acquired refresh lock lives before Redis expires it (default
   *  30 s); overridable so tests can exercise expiry under a live holder. */
  lockTtlMs?: number;
}

export class RedisSessionStore implements SessionStore {
  private readonly lockMaxWaitMs: number;
  private readonly lockTtlMs: number;

  constructor(
    private readonly redis: IORedis,
    options: RedisSessionStoreOptions = {},
  ) {
    this.lockMaxWaitMs = options.lockMaxWaitMs ?? LOCK_MAX_WAIT_MS;
    this.lockTtlMs = options.lockTtlMs ?? LOCK_TTL_MS;
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

  async update(sessionId: string, patch: Partial<SessionRecord>): Promise<boolean> {
    const existing = await this.get(sessionId);
    if (!existing) return false;
    const updated: SessionRecord = { ...existing, ...patch, lastRefreshedAt: Date.now() };
    // XX: only if the key still exists. A delete (logout / admin revoke) that
    // landed between the read above and this write must win -- a plain SET
    // would silently resurrect the revoked session. `null` = it was deleted.
    const written = await this.redis.set(
      SESSION_KEY(sessionId),
      JSON.stringify(updated),
      'EX',
      SESSION_TTL_SECONDS,
      'XX',
    );
    return written === 'OK';
  }

  async delete(sessionId: string): Promise<SessionRecord | null> {
    // GETDEL: read-and-delete in ONE atomic command, so the returned record is
    // exactly what was deleted -- never a stale read of a token a concurrent
    // refresh has since rotated.
    const raw = await this.redis.getdel(SESSION_KEY(sessionId));
    if (!raw) return null;
    const deleted = JSON.parse(raw) as SessionRecord;
    await this.redis.srem(USER_SESSIONS_KEY(deleted.uid), sessionId);
    return deleted;
  }

  async deleteAllForUser(uid: string): Promise<SessionRecord[]> {
    const ids = await this.redis.smembers(USER_SESSIONS_KEY(uid));
    if (ids.length === 0) return [];
    // One atomic MULTI of GETDELs: the records returned are the ones actually
    // deleted, with their tokens at the moment of deletion (callers -- admin
    // revoke-user -- revoke each at the provider), not an earlier read.
    const multi = this.redis.multi();
    for (const id of ids) multi.getdel(SESSION_KEY(id));
    multi.del(USER_SESSIONS_KEY(uid));
    const results = (await multi.exec()) ?? [];
    const deleted: SessionRecord[] = [];
    for (let i = 0; i < ids.length; i++) {
      const [err, raw] = results[i] ?? [null, null];
      if (!err && typeof raw === 'string') deleted.push(JSON.parse(raw) as SessionRecord);
    }
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
      const acquired = await this.redis.set(key, token, 'PX', this.lockTtlMs, 'NX');
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
