import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');

// The template snapshot copies an explicit file list (snapshot-templates.mjs). A Dockerfile that
// docker-compose.yml builds but the list misses ships a compose file that cannot `docker compose build`.
describe('template snapshot ships every Dockerfile that docker-compose.yml builds', () => {
  it('lists each compose `dockerfile:` in snapshot-templates.mjs', async () => {
    const compose = await readFile(resolve(repoRoot, 'docker-compose.yml'), 'utf8');
    const snapshot = await readFile(
      resolve(repoRoot, 'tools/create-icore/scripts/snapshot-templates.mjs'),
      'utf8',
    );
    const referenced = [...compose.matchAll(/^\s+dockerfile:\s*(\S+)\s*$/gm)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0);
    const missing = referenced.filter((f) => !snapshot.includes(`'${f}'`));
    expect(missing).toEqual([]);
  });
});
