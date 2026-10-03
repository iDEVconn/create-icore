import type IORedis from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedisSessionStore } from '../redis-session-store';
import { startTestRedis, type TestRedis } from './redis-test-server';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Real Redis (see redis-test-server.ts): these properties are about Redis
// semantics (SET XX, lock expiry), a fake would only test itself.
let testRedis: TestRedis;
let redis: IORedis;

beforeAll(async () => {
  testRedis = await startTestRedis();
  redis = testRedis.redis;
}, 900_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await redis.flushdb();
});

afterAll(async () => {
  await testRedis?.stop();
});

const record = {
  uid: 'u1',
  email: 'a@x.com',
  providerAccessToken: 'at1',
  providerRefreshToken: 'rt1',
  providerAccessTokenExpiresAt: Date.now() + 3_600_000,
};

describe('RedisSessionStore.update — concurrent delete', () => {
  it('does not resurrect a session that was deleted between its read and its write', async () => {
    const store = new RedisSessionStore(redis);
    const created = await store.create(record);
    // An admin revoke (deleteAllForUser) lands right after update() read the record.
    const realGet = redis.get.bind(redis);
    vi.spyOn(redis, 'get').mockImplementationOnce((async (key: string) => {
      const value = await realGet(key);
      await redis.del(key);
      return value;
    }) as never);

    await store.update(created.sessionId, { providerRefreshToken: 'rt2' });

    expect(await store.get(created.sessionId)).toBeNull();
  });
});

describe('RedisSessionStore.withRefreshLock — TTL', () => {
  it('a lock within its TTL excludes a second caller', async () => {
    const store = new RedisSessionStore(redis, { lockTtlMs: 2_000 });
    const events: string[] = [];
    const holder = store.withRefreshLock('s1', async () => {
      events.push('A:in');
      await sleep(200);
      events.push('A:out');
    });
    await sleep(50);
    await store.withRefreshLock('s1', async () => {
      events.push('B:in');
    });
    await holder;
    expect(events).toEqual(['A:in', 'A:out', 'B:in']);
  });

  it('a lock that EXPIRED under a live holder lets a second caller in — why the work done inside it must be bounded', async () => {
    const store = new RedisSessionStore(redis, { lockTtlMs: 100 });
    const events: string[] = [];
    const holder = store.withRefreshLock('s1', async () => {
      events.push('A:in');
      await sleep(400);
      events.push('A:out');
    });
    await sleep(200); // A's lock has expired but A is still working
    await store.withRefreshLock('s1', async () => {
      events.push('B:in');
    });
    await holder;
    expect(events).toEqual(['A:in', 'B:in', 'A:out']);
  });
});
