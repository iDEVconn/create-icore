import { describe, expect, it } from 'vitest';
import { FakeDurableObjectStorage } from '@icore/shared/testing';
import { SessionDurableObject, ThrottleDurableObject } from '../durable-objects';

const ctx = () => ({ storage: new FakeDurableObjectStorage() });
const record = {
  sessionId: 'u.s1',
  uid: 'u',
  email: 'u@x.com',
  providerAccessToken: 'at',
  providerRefreshToken: 'rt',
  providerAccessTokenExpiresAt: 1,
  createdAt: 1,
  lastRefreshedAt: 1,
};

describe('SessionDurableObject', () => {
  it('exposes the session operations over its own storage', async () => {
    const c = ctx();
    const object = new SessionDurableObject(c as never, {});
    await object.create(record);
    expect((await object.get('u.s1'))?.email).toBe('u@x.com');
    expect(await object.update('u.s1', { providerRefreshToken: 'rt2' })).toBe(true);
    expect(await object.tryLock('u.s1', 'a', 1000)).toBe(true);
    expect(await object.tryLock('u.s1', 'b', 1000)).toBe(false);
    await object.unlock('u.s1', 'a');
    expect((await object.delete('u.s1'))?.providerRefreshToken).toBe('rt2');
    expect(await object.get('u.s1')).toBeNull();
  });

  it('deleteAll returns what it removed, and alarm() keeps working on the same storage', async () => {
    const object = new SessionDurableObject(ctx() as never, {});
    await object.create(record);
    await object.create({ ...record, sessionId: 'u.s2' });
    expect(await object.deleteAll()).toHaveLength(2);
    await expect(object.alarm()).resolves.toBeUndefined();
  });

  it('keeps two objects isolated (each has its own storage)', async () => {
    const a = new SessionDurableObject(ctx() as never, {});
    const b = new SessionDurableObject(ctx() as never, {});
    await a.create(record);
    expect(await b.get('u.s1')).toBeNull();
  });
});

describe('ThrottleDurableObject', () => {
  it('counts hits and blocks past the limit', async () => {
    const object = new ThrottleDurableObject(ctx() as never, {});
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await object.increment(60_000, 2, 0));
    expect(results.map((r) => r.isBlocked)).toEqual([false, false, true]);
    await expect(object.alarm()).resolves.toBeUndefined();
  });
});
