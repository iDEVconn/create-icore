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
