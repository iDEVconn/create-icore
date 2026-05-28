import { describe, expect, it } from 'vitest';
import { FakeStorageStrategy } from '@icore/shared';
import { StorageController } from '../storage.controller';

const fixture = () => {
  const strategy = new FakeStorageStrategy();
  return { strategy, controller: new StorageController(strategy) };
};

const file = (filename = 'hello.txt') => ({
  buffer: Buffer.from('hello world').toString('base64'),
  filename,
  mimeType: 'text/plain',
});

describe('StorageController', () => {
  it('upload returns a StorageRef under the user prefix', async () => {
    const { controller } = fixture();
    const ref = await controller.upload({ userId: 'user-1', file: file() });
    expect(ref.path.startsWith('user-1/')).toBe(true);
  });

  it('list returns previously uploaded files for the same user', async () => {
    const { controller } = fixture();
    await controller.upload({ userId: 'user-2', file: file() });
    const refs = await controller.list({ userId: 'user-2' });
    expect(refs.length).toBe(1);
  });

  it('signedUrl returns a non-empty string', async () => {
    const { controller } = fixture();
    const ref = await controller.upload({ userId: 'user-3', file: file() });
    const url = await controller.signedUrl({ userId: 'user-3', ref, ttlSec: 60 });
    expect(url.length).toBeGreaterThan(0);
  });

  it('remove deletes the file', async () => {
    const { controller } = fixture();
    const ref = await controller.upload({ userId: 'user-4', file: file() });
    await controller.remove({ userId: 'user-4', ref });
    expect(await controller.list({ userId: 'user-4' })).toEqual([]);
  });

  it('signedUrl for a foreign user throws', async () => {
    const { controller } = fixture();
    const ref = await controller.upload({ userId: 'owner', file: file() });
    await expect(controller.signedUrl({ userId: 'attacker', ref })).rejects.toThrow();
  });
});
