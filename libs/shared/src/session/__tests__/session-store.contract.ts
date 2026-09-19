import { describe, expect, it, vi } from 'vitest';
import type { SessionStore } from '../session-store';

export function runSessionStoreContract(name: string, factory: () => SessionStore) {
  describe(`SessionStore contract: ${name}`, () => {
    it('creates and retrieves a session', async () => {
      const store = factory();
      const created = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: Date.now() + 3600_000,
      });
      expect(created.sessionId).toBeTruthy();
      const fetched = await store.get(created.sessionId);
      expect(fetched?.uid).toBe('u1');
      expect(fetched?.providerAccessToken).toBe('at1');
    });

    it('returns null for an unknown session', async () => {
      const store = factory();
      expect(await store.get('does-not-exist')).toBeNull();
    });

    it('update() patches only the given fields', async () => {
      const store = factory();
      const created = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: 1,
      });
      await store.update(created.sessionId, { providerAccessToken: 'at2' });
      const fetched = await store.get(created.sessionId);
      expect(fetched?.providerAccessToken).toBe('at2');
      expect(fetched?.providerRefreshToken).toBe('rt1');
    });

    it('delete() removes the session', async () => {
      const store = factory();
      const created = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: 1,
      });
      await store.delete(created.sessionId);
      expect(await store.get(created.sessionId)).toBeNull();
    });

    it('deleteAllForUser() kills every session for that uid, leaves others', async () => {
      const store = factory();
      const s1 = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: 1,
      });
      const s2 = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at2',
        providerRefreshToken: 'rt2',
        providerAccessTokenExpiresAt: 1,
      });
      const other = await store.create({
        uid: 'u2',
        email: 'c@d.com',
        providerAccessToken: 'at3',
        providerRefreshToken: 'rt3',
        providerAccessTokenExpiresAt: 1,
      });
      const deleted = await store.deleteAllForUser('u1');
      expect(await store.get(s1.sessionId)).toBeNull();
      expect(await store.get(s2.sessionId)).toBeNull();
      expect(await store.get(other.sessionId)).not.toBeNull();
      expect(deleted).toHaveLength(2);
      expect(deleted.map((r) => r.sessionId).sort()).toEqual([s1.sessionId, s2.sessionId].sort());
      expect(deleted.every((r) => r.uid === 'u1')).toBe(true);
      expect(deleted.some((r) => r.sessionId === other.sessionId)).toBe(false);
    });

    it('withRefreshLock() serializes concurrent callers for the same sessionId', async () => {
      const store = factory();
      const created = await store.create({
        uid: 'u1',
        email: 'a@b.com',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: 1,
      });
      let running = 0;
      let maxConcurrent = 0;
      const fn = vi.fn(async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
        return 'done';
      });
      const results = await Promise.all([
        store.withRefreshLock(created.sessionId, fn),
        store.withRefreshLock(created.sessionId, fn),
        store.withRefreshLock(created.sessionId, fn),
      ]);
      expect(maxConcurrent).toBe(1);
      expect(results).toEqual(['done', 'done', 'done']);
    });
  });
}
