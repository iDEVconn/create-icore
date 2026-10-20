import { describe, it, expect } from 'vitest';
import { R2StorageStrategy } from '../r2-storage.strategy.js';
import { createMockR2 } from '../testing/mock-r2.js';
import type { R2ClientLike } from '../r2-storage.strategy.js';

const BUCKET = 'icore-uploads';

function setup() {
  const inner = createMockR2();
  const ttls: number[] = [];
  const client: R2ClientLike = {
    ...inner,
    presignGetObject: (b, k, ttl) => {
      ttls.push(ttl);
      return inner.presignGetObject(b, k, ttl);
    },
  };
  return { strategy: new R2StorageStrategy({ client, bucket: BUCKET }), ttls, inner };
}

const file = { buffer: Buffer.from('hi'), filename: 'a.txt', mimeType: 'text/plain' };

describe('R2StorageStrategy', () => {
  it('getSignedUrl default ttl is 900', async () => {
    const { strategy, ttls } = setup();
    const ref = await strategy.upload('u1', file);
    await strategy.getSignedUrl('u1', ref);
    expect(ttls).toEqual([900]);
  });

  it('getSignedUrl clamps ttl above 604800', async () => {
    const { strategy, ttls } = setup();
    const ref = await strategy.upload('u1', file);
    await strategy.getSignedUrl('u1', ref, 10_000_000);
    expect(ttls).toEqual([604800]);
  });

  it('keeps a ttl within the limit untouched', async () => {
    const { strategy, ttls } = setup();
    const ref = await strategy.upload('u1', file);
    await strategy.getSignedUrl('u1', ref, 60);
    expect(ttls).toEqual([60]);
  });

  it('list returns every key when the client reports more than one page', async () => {
    const { strategy, inner } = setup();
    for (let i = 0; i < 2500; i++) {
      await inner.putObject(BUCKET, `u1/f${i}`, Buffer.from('x'), 'text/plain');
    }
    const refs = await strategy.list('u1');
    expect(refs).toHaveLength(2500);
  });

  it('rejects foreign-user remove and getSignedUrl as forbidden', async () => {
    const { strategy } = setup();
    const ref = await strategy.upload('u1', file);
    await expect(strategy.remove('u2', ref)).rejects.toThrow('forbidden');
    await expect(strategy.getSignedUrl('u2', ref)).rejects.toThrow('forbidden');
  });

  it('does not treat a user id that is a prefix of another as the owner', async () => {
    const { strategy } = setup();
    const ref = await strategy.upload('u10', file);
    await expect(strategy.remove('u1', ref)).rejects.toThrow('forbidden');
  });
});
