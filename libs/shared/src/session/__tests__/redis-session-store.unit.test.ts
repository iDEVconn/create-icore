import { describe, expect, it, vi } from 'vitest';
import type IORedis from 'ioredis';
import { RedisSessionStore } from '../redis-session-store';

// These cover the lock's FAILURE bound, which needs no real Redis: a stub
// that never grants the lock is exactly the "wedged Redis" case. The
// happy-path/contract behaviour is covered against a real server in
// redis-session-store.contract.integration.test.ts.
describe('RedisSessionStore.withRefreshLock — bounded acquisition', () => {
  it('gives up with a timeout instead of looping forever when the lock is never granted', async () => {
    const set = vi.fn().mockResolvedValue(null); // SET NX always loses
    const evalFn = vi.fn();
    const redis = { set, eval: evalFn } as unknown as IORedis;
    const store = new RedisSessionStore(redis, { lockMaxWaitMs: 150 });
    const fn = vi.fn();

    await expect(store.withRefreshLock('sid-1', fn)).rejects.toThrow(
      /session_refresh_lock_timeout/,
    );
    expect(fn).not.toHaveBeenCalled();
    // Never acquired => must never run the release script (which would be
    // a no-op anyway, but releasing a lock we don't hold is the TOCTOU bug
    // the Lua script exists to prevent).
    expect(evalFn).not.toHaveBeenCalled();
    expect(set.mock.calls.length).toBeGreaterThan(1); // it did retry, not one-shot
  });

  it('runs the callback and releases the lock when acquisition succeeds', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const evalFn = vi.fn().mockResolvedValue(1);
    const redis = { set, eval: evalFn } as unknown as IORedis;
    const store = new RedisSessionStore(redis, { lockMaxWaitMs: 150 });

    await expect(store.withRefreshLock('sid-1', async () => 'done')).resolves.toBe('done');
    expect(evalFn).toHaveBeenCalledOnce();
  });
});
