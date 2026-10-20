import type { NewSessionRecord, SessionRecord, SessionStore } from '../session/session-store';
import type { DurableObjectNamespaceLike } from './durable-object-types';
import type { SessionObjectStub } from './session-object-core';

const LOCK_TTL_MS = 30_000;
const LOCK_POLL_MS = 50;
const LOCK_MAX_WAIT_MS = 20_000;

export interface DurableObjectSessionStoreOptions {
  lockMaxWaitMs?: number;
  lockTtlMs?: number;
  lockPollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromB64url = (s: string): Uint8Array => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

/** `base64url(uid).<256-bit random>`: the prefix routes to the user's object, the random part is the secret. */
function newSessionId(uid: string): string {
  const random = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return `${b64url(new TextEncoder().encode(uid))}.${b64url(random)}`;
}

function uidOf(sessionId: string): string | null {
  const dot = sessionId.indexOf('.');
  if (dot <= 0 || dot === sessionId.length - 1) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(fromB64url(sessionId.slice(0, dot)));
  } catch {
    return null;
  }
}

/**
 * SessionStore over a SQLite-backed Durable Object, one object per user. A user's
 * `deleteAllForUser` (admin revoke, password reset) is therefore one atomic call.
 * Not live-tested on Cloudflare; the object logic (`SessionObjectCore`) and this
 * class pass the shared SessionStore contract against an in-memory namespace.
 */
export class DurableObjectSessionStore implements SessionStore {
  private readonly lockMaxWaitMs: number;
  private readonly lockTtlMs: number;
  private readonly lockPollMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly namespace: DurableObjectNamespaceLike<SessionObjectStub>,
    options: DurableObjectSessionStoreOptions = {},
  ) {
    this.lockMaxWaitMs = options.lockMaxWaitMs ?? LOCK_MAX_WAIT_MS;
    this.lockTtlMs = options.lockTtlMs ?? LOCK_TTL_MS;
    this.lockPollMs = options.lockPollMs ?? LOCK_POLL_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async create(record: NewSessionRecord): Promise<SessionRecord> {
    const now = Date.now();
    const full: SessionRecord = {
      ...record,
      sessionId: newSessionId(record.uid),
      createdAt: now,
      lastRefreshedAt: now,
    };
    await this.stubForUid(record.uid).create(full);
    return full;
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const stub = this.stubForSession(sessionId);
    return stub ? stub.get(sessionId) : null;
  }

  async update(sessionId: string, patch: Partial<SessionRecord>): Promise<boolean> {
    const stub = this.stubForSession(sessionId);
    return stub ? stub.update(sessionId, patch) : false;
  }

  async delete(sessionId: string): Promise<SessionRecord | null> {
    const stub = this.stubForSession(sessionId);
    return stub ? stub.delete(sessionId) : null;
  }

  async deleteAllForUser(uid: string): Promise<SessionRecord[]> {
    return this.stubForUid(uid).deleteAll();
  }

  async withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const stub = this.stubForSession(sessionId);
    if (!stub) throw new Error('invalid_session_id');
    const token = globalThis.crypto.randomUUID();
    const deadline = Date.now() + this.lockMaxWaitMs;
    while (!(await stub.tryLock(sessionId, token, this.lockTtlMs))) {
      if (Date.now() >= deadline) throw new Error('session_refresh_lock_timeout');
      await this.sleep(this.lockPollMs);
    }
    try {
      return await fn();
    } finally {
      await stub.unlock(sessionId, token);
    }
  }

  private stubForUid(uid: string): SessionObjectStub {
    return this.namespace.get(this.namespace.idFromName(uid));
  }

  private stubForSession(sessionId: string): SessionObjectStub | null {
    const uid = uidOf(sessionId);
    return uid === null ? null : this.stubForUid(uid);
  }
}
