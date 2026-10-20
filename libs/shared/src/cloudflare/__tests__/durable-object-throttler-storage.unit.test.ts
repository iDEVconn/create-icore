import { describe, expect, it } from 'vitest';
import { DurableObjectThrottlerStorage } from '../durable-object-throttler-storage';
import { ThrottleObjectCore, type ThrottleObjectStub } from '../throttle-object-core';
import { FakeNamespace } from './fake-durable-object';

const setup = () => {
  let now = 10_000;
  const ns = new FakeNamespace<ThrottleObjectStub & { alarm(): Promise<void> }>(
    (storage) => new ThrottleObjectCore(storage, () => now),
  );
  return {
    ns,
    storage: new DurableObjectThrottlerStorage(ns),
    advance: (ms: number) => (now += ms),
  };
};

describe('DurableObjectThrottlerStorage', () => {
  it('counts hits up to the limit, then blocks (no block duration)', async () => {
    const { storage } = setup();
    const results = [];
    for (let i = 0; i < 4; i++)
      results.push(await storage.increment('ip1', 60_000, 3, 0, 'auth-burst'));
    expect(results.map((r) => r.isBlocked)).toEqual([false, false, false, true]);
    expect(results.map((r) => r.totalHits)).toEqual([1, 2, 3, 4]);
    expect(results[0].timeToExpire).toBe(60);
    expect(results[3].timeToBlockExpire).toBeGreaterThan(0);
    expect(results[0].timeToBlockExpire).toBe(0);
  });

  it('lets hits expire after the ttl', async () => {
    const { storage, advance } = setup();
    for (let i = 0; i < 3; i++) await storage.increment('ip1', 1_000, 3, 0, 'default');
    expect((await storage.increment('ip1', 1_000, 3, 0, 'default')).isBlocked).toBe(true);
    advance(1_001);
    expect((await storage.increment('ip1', 1_000, 3, 0, 'default')).isBlocked).toBe(false);
  });

  it('with a block duration, blocks past the limit and stays blocked until it elapses', async () => {
    const { storage, advance } = setup();
    for (let i = 0; i < 2; i++)
      expect((await storage.increment('k', 1_000, 2, 5_000, 'n')).isBlocked).toBe(false);
    const blocked = await storage.increment('k', 1_000, 2, 5_000, 'n');
    expect(blocked).toMatchObject({ isBlocked: true, timeToBlockExpire: 5 });
    advance(2_000);
    expect((await storage.increment('k', 1_000, 2, 5_000, 'n')).isBlocked).toBe(true);
    advance(3_100);
    const after = await storage.increment('k', 1_000, 2, 5_000, 'n');
    expect(after).toMatchObject({ isBlocked: false, totalHits: 1 });
  });

  it('keeps separate counters per throttler name and per key', async () => {
    const { storage, ns } = setup();
    await storage.increment('ip1', 60_000, 1, 0, 'auth-burst');
    expect((await storage.increment('ip1', 60_000, 1, 0, 'auth-burst')).isBlocked).toBe(true);
    expect((await storage.increment('ip1', 60_000, 1, 0, 'ai-burst')).isBlocked).toBe(false);
    expect((await storage.increment('ip2', 60_000, 1, 0, 'auth-burst')).isBlocked).toBe(false);
    expect([...ns.storages.keys()].sort()).toEqual([
      'ai-burst:ip1',
      'auth-burst:ip1',
      'auth-burst:ip2',
    ]);
  });

  it('is exact under concurrency (no lost updates)', async () => {
    const { storage } = setup();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => storage.increment('ip', 60_000, 10, 0, 'n')),
    );
    expect(results.filter((r) => !r.isBlocked)).toHaveLength(10);
  });

  it('alarm forgets a counter nothing depends on any more', async () => {
    const { storage, ns, advance } = setup();
    await storage.increment('ip', 1_000, 5, 0, 'n');
    advance(10_000);
    await ns.get('n:ip').alarm();
    expect(ns.storages.get('n:ip')?.data.size).toBe(0);
  });
});
