import { describe, expect, it } from 'vitest';
import { runSessionStoreContract } from '../../session/__tests__/session-store.contract';
import { DurableObjectSessionStore } from '../durable-object-session-store';
import { SessionObjectCore, type SessionObjectStub } from '../session-object-core';
import { FakeNamespace } from './fake-durable-object';

const sessions = (now?: () => number) =>
  new FakeNamespace<SessionObjectStub>((storage) => new SessionObjectCore(storage, { now }));
const newRecord = (uid: string, extra = {}) => ({
  uid,
  email: `${uid}@x.com`,
  providerAccessToken: 'at',
  providerRefreshToken: 'rt',
  providerAccessTokenExpiresAt: 1,
  ...extra,
});

runSessionStoreContract(
  'DurableObjectSessionStore',
  () => new DurableObjectSessionStore(sessions()),
);

describe('DurableObjectSessionStore', () => {
  it('keeps one user per object and routes by the session id prefix', async () => {
    const ns = sessions();
    const store = new DurableObjectSessionStore(ns);
    const a = await store.create(newRecord('user-a'));
    const b = await store.create(newRecord('user/b é'));
    expect([...ns.storages.keys()].sort()).toEqual(['user-a', 'user/b é']);
    expect((await store.get(a.sessionId))?.uid).toBe('user-a');
    expect((await store.get(b.sessionId))?.uid).toBe('user/b é');
  });

  it('deleteAllForUser removes only that user and returns exactly what it deleted', async () => {
    const store = new DurableObjectSessionStore(sessions());
    const a1 = await store.create(newRecord('a'));
    const a2 = await store.create(newRecord('a'));
    const b1 = await store.create(newRecord('b'));
    await store.update(a1.sessionId, { providerRefreshToken: 'rt-rotated' });
    const deleted = await store.deleteAllForUser('a');
    expect(deleted.map((r) => r.sessionId).sort()).toEqual([a1.sessionId, a2.sessionId].sort());
    expect(deleted.find((r) => r.sessionId === a1.sessionId)?.providerRefreshToken).toBe(
      'rt-rotated',
    );
    expect(await store.get(a1.sessionId)).toBeNull();
    expect(await store.get(b1.sessionId)).not.toBeNull();
  });

  it('delete() returns the record as it was at deletion, and null the second time', async () => {
    const store = new DurableObjectSessionStore(sessions());
    const s = await store.create(newRecord('a'));
    await store.update(s.sessionId, { providerRefreshToken: 'rt2' });
    expect((await store.delete(s.sessionId))?.providerRefreshToken).toBe('rt2');
    expect(await store.delete(s.sessionId)).toBeNull();
  });

  it('update() never resurrects a deleted session and cannot change its identity', async () => {
    const store = new DurableObjectSessionStore(sessions());
    const s = await store.create(newRecord('a'));
    expect(await store.update(s.sessionId, { uid: 'evil', sessionId: 'x' })).toBe(true);
    expect((await store.get(s.sessionId))?.uid).toBe('a');
    await store.delete(s.sessionId);
    expect(await store.update(s.sessionId, { providerAccessToken: 'zzz' })).toBe(false);
    expect(await store.get(s.sessionId)).toBeNull();
  });

  it('treats malformed, foreign or guessed session ids as unknown', async () => {
    const store = new DurableObjectSessionStore(sessions());
    const s = await store.create(newRecord('a'));
    const [prefix] = s.sessionId.split('.');
    for (const bad of ['', 'nodot', '.x', 'x.', '%%%.abc', `${prefix}.wrong-random`]) {
      expect(await store.get(bad)).toBeNull();
      expect(await store.update(bad, { email: 'e' })).toBe(false);
      expect(await store.delete(bad)).toBeNull();
    }
    await expect(store.withRefreshLock('nodot', async () => 1)).rejects.toThrow(
      'invalid_session_id',
    );
    expect(await store.get(s.sessionId)).not.toBeNull();
  });

  it('expires idle sessions and lets the alarm sweep them', async () => {
    let now = 1_000;
    const ns = new FakeNamespace<SessionObjectStub & { alarm(): Promise<void> }>(
      (storage) => new SessionObjectCore(storage, { now: () => now, sessionTtlMs: 100 }),
    );
    const store = new DurableObjectSessionStore(ns);
    const s = await store.create(newRecord('a'));
    expect(ns.storages.get('a')?.alarmAt).toBe(1_100);
    now = 1_050;
    expect(await store.get(s.sessionId)).not.toBeNull();
    now = 1_200;
    expect(await store.get(s.sessionId)).toBeNull();
    const s2 = await store.create(newRecord('a'));
    now = 1_500;
    await ns.get('a').alarm();
    expect([...(ns.storages.get('a')?.data.keys() ?? [])]).toEqual([]);
    expect(await store.get(s2.sessionId)).toBeNull();
  });

  describe('withRefreshLock', () => {
    it('is single-flight per session', async () => {
      const store = new DurableObjectSessionStore(sessions(), { lockPollMs: 1 });
      const s = await store.create(newRecord('a'));
      let inside = 0;
      let maxInside = 0;
      await Promise.all(
        Array.from({ length: 5 }, () =>
          store.withRefreshLock(s.sessionId, async () => {
            maxInside = Math.max(maxInside, ++inside);
            await new Promise((r) => setTimeout(r, 5));
            inside--;
          }),
        ),
      );
      expect(maxInside).toBe(1);
    });

    it('releases the lock when fn throws', async () => {
      const store = new DurableObjectSessionStore(sessions(), { lockPollMs: 1 });
      const s = await store.create(newRecord('a'));
      await expect(
        store.withRefreshLock(s.sessionId, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      await expect(store.withRefreshLock(s.sessionId, async () => 'ok')).resolves.toBe('ok');
    });

    it('does not block other sessions', async () => {
      const store = new DurableObjectSessionStore(sessions(), { lockPollMs: 1 });
      const s1 = await store.create(newRecord('a'));
      const s2 = await store.create(newRecord('a'));
      const result = await store.withRefreshLock(s1.sessionId, () =>
        store.withRefreshLock(s2.sessionId, async () => 'inner'),
      );
      expect(result).toBe('inner');
    });

    it('gives up waiting after lockMaxWaitMs', async () => {
      const store = new DurableObjectSessionStore(sessions(), { lockMaxWaitMs: 30, lockPollMs: 5 });
      const s = await store.create(newRecord('a'));
      let release!: () => void;
      const holder = store.withRefreshLock(
        s.sessionId,
        () => new Promise<void>((r) => (release = r)),
      );
      await new Promise((r) => setTimeout(r, 5));
      await expect(store.withRefreshLock(s.sessionId, async () => 1)).rejects.toThrow(
        'session_refresh_lock_timeout',
      );
      release();
      await holder;
    });

    it('a lease expires under a stuck holder, and the stale holder cannot free the new lease', async () => {
      let now = 0;
      const ns = sessions(() => now);
      const store = new DurableObjectSessionStore(ns, { lockTtlMs: 100, lockPollMs: 1 });
      const s = await store.create(newRecord('a'));
      const stub = ns.get(ns.idFromName('a'));
      expect(await stub.tryLock(s.sessionId, 'stale', 100)).toBe(true);
      expect(await stub.tryLock(s.sessionId, 'other', 100)).toBe(false);
      now = 150;
      expect(await stub.tryLock(s.sessionId, 'fresh', 100)).toBe(true);
      await stub.unlock(s.sessionId, 'stale');
      expect(await stub.tryLock(s.sessionId, 'other', 100)).toBe(false);
      await stub.unlock(s.sessionId, 'fresh');
      expect(await stub.tryLock(s.sessionId, 'other', 100)).toBe(true);
    });
  });
});
