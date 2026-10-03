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

  it('deleteAllForUser does not return an expired record', async () => {
    let t = 1_000_000;
    const store = new InMemorySessionStore({ sweepIntervalMs: 0, now: () => t });
    await store.create(record);
    t += 31 * DAY;
    await store.create({ ...record, providerRefreshToken: 'rt-live' });
    const deleted = await store.deleteAllForUser('u1');
    expect(deleted.map((r) => r.providerRefreshToken)).toEqual(['rt-live']);
  });

  it('the periodic sweep drops expired sessions without any read', async () => {
    vi.useFakeTimers();
    try {
      const store = new InMemorySessionStore({ sweepIntervalMs: DAY });
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

  it('keeps single-flight for a caller arriving after a waiter timed out while the holder still runs', async () => {
    store = new InMemorySessionStore({ sweepIntervalMs: 0, lockMaxWaitMs: 40 });
    let running = 0;
    let maxConcurrent = 0;
    const guarded = async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await sleep(150);
      running--;
    };
    const holder = store.withRefreshLock('s1', guarded);
    await sleep(5);
    const timedOut = store.withRefreshLock('s1', async () => 'late');
    await expect(timedOut).rejects.toThrow('session_refresh_lock_timeout: s1');
    // holder is still inside fn(); a new caller must queue behind it, not run beside it
    const third = store.withRefreshLock('s1', guarded).catch(() => 'timeout');
    await Promise.all([holder, third]);
    expect(maxConcurrent).toBe(1);
  });
});
