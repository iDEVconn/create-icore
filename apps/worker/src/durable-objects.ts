import { DurableObject } from 'cloudflare:workers';
import {
  SessionObjectCore,
  ThrottleObjectCore,
  type SessionRecord,
  type DurableObjectStorageLike,
} from '@icore/shared';

// Thin Durable Object shells: the logic (and its tests) lives in `@icore/shared`.
// Methods are called over RPC by `DurableObjectSessionStore` / `DurableObjectThrottlerStorage`.

export class SessionDurableObject extends DurableObject {
  private readonly core = new SessionObjectCore(this.ctx.storage as DurableObjectStorageLike);

  create(record: SessionRecord) {
    return this.core.create(record);
  }
  get(sessionId: string) {
    return this.core.get(sessionId);
  }
  update(sessionId: string, patch: Partial<SessionRecord>) {
    return this.core.update(sessionId, patch);
  }
  delete(sessionId: string) {
    return this.core.delete(sessionId);
  }
  deleteAll() {
    return this.core.deleteAll();
  }
  tryLock(sessionId: string, token: string, ttlMs: number) {
    return this.core.tryLock(sessionId, token, ttlMs);
  }
  unlock(sessionId: string, token: string) {
    return this.core.unlock(sessionId, token);
  }
  alarm() {
    return this.core.alarm();
  }
}

export class ThrottleDurableObject extends DurableObject {
  private readonly core = new ThrottleObjectCore(this.ctx.storage as DurableObjectStorageLike);

  increment(ttl: number, limit: number, blockDuration: number) {
    return this.core.increment(ttl, limit, blockDuration);
  }
  alarm() {
    return this.core.alarm();
  }
}
