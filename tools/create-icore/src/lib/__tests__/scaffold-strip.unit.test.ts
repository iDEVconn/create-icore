import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeFirebaseAdminLib } from '../scaffold-strip.js';

describe('removeFirebaseAdminLib', () => {
  it('silently no-ops when tsconfig.base.json does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-scaffold-strip-'));

    // Should not throw
    await expect(removeFirebaseAdminLib(dir)).resolves.not.toThrow();
  });

  it('propagates a real error (e.g., malformed JSON) instead of swallowing it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-scaffold-strip-malformed-'));

    // Write a malformed tsconfig.base.json (invalid JSON)
    await writeFile(join(dir, 'tsconfig.base.json'), '{ invalid json }');

    // Should throw when trying to parse the malformed JSON
    await expect(removeFirebaseAdminLib(dir)).rejects.toThrow();
  });
});
