import { describe, expect, it, beforeEach } from 'vitest';
import type { FileInput, StorageStrategy } from '../storage';

const fixture = (): FileInput => ({
  buffer: Buffer.from('hello world'),
  filename: 'hello.txt',
  mimeType: 'text/plain',
});

export function runStorageContract(name: string, factory: () => StorageStrategy): void {
  describe(`StorageStrategy contract: ${name}`, () => {
    let strategy: StorageStrategy;

    beforeEach(() => {
      strategy = factory();
    });

    it('upload returns a StorageRef under the user prefix', async () => {
      const ref = await strategy.upload('user-1', fixture());
      expect(ref.path.startsWith('user-1/')).toBe(true);
      expect(ref.bucket).toBeTruthy();
    });

    it('list returns previously uploaded files for the same user', async () => {
      await strategy.upload('user-2', fixture());
      const refs = await strategy.list('user-2');
      expect(refs.length).toBe(1);
    });

    it('list isolates users', async () => {
      await strategy.upload('user-a', fixture());
      expect(await strategy.list('user-b')).toEqual([]);
    });

    it('getSignedUrl returns a non-empty string', async () => {
      const ref = await strategy.upload('user-3', fixture());
      const url = await strategy.getSignedUrl('user-3', ref, 60);
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });

    it('remove deletes the file', async () => {
      const ref = await strategy.upload('user-4', fixture());
      await strategy.remove('user-4', ref);
      expect(await strategy.list('user-4')).toEqual([]);
    });

    it('signed URL for a foreign user throws', async () => {
      const ref = await strategy.upload('owner', fixture());
      await expect(strategy.getSignedUrl('attacker', ref)).rejects.toThrow();
    });
  });
}
