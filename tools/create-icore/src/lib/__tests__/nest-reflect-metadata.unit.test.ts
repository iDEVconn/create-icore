import { describe, expect, it } from 'vitest';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');

// Nest 12 no longer imports reflect-metadata itself. Without an explicit first import, decorator
// metadata silently goes missing on entries that do not pull it in transitively.
async function entryPoints(): Promise<string[]> {
  const out = [join('apps/api/src/main.ts')];
  const ms = await readdir(resolve(repoRoot, 'apps/microservices'), { withFileTypes: true });
  for (const d of ms) {
    const main = join('apps/microservices', d.name, 'src/main.ts');
    if (
      d.isDirectory() &&
      (await access(resolve(repoRoot, main)).then(
        () => true,
        () => false,
      ))
    ) {
      out.push(main);
    }
  }
  out.push(
    'tools/workspace-plugin/src/generators/microservice/files/microservice/src/main.ts__tmpl__',
  );
  return out;
}

describe('Nest 12 needs an explicit reflect-metadata import', () => {
  it('every Nest entry point (and the microservice generator template) imports it first', async () => {
    const offenders: string[] = [];
    for (const rel of await entryPoints()) {
      const src = await readFile(resolve(repoRoot, rel), 'utf8');
      const first = src.split('\n').find((l) => l.trim() !== '' && !l.trim().startsWith('//'));
      if (!first || !/^import ['"]reflect-metadata['"];?/.test(first.trim())) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('every vitest config of a Nest app loads reflect-metadata through setupFiles', async () => {
    const configs = [
      'apps/api/vitest.config.mts',
      'apps/worker/vitest.config.mts',
      'tools/workspace-plugin/src/generators/microservice/files/microservice/vitest.config.mts__tmpl__',
    ];
    const ms = await readdir(resolve(repoRoot, 'apps/microservices'), { withFileTypes: true });
    for (const d of ms) {
      if (d.isDirectory() && !d.name.endsWith('-e2e')) {
        configs.push(join('apps/microservices', d.name, 'vitest.config.mts'));
      }
    }
    const offenders: string[] = [];
    for (const rel of configs) {
      const src = await readFile(resolve(repoRoot, rel), 'utf8').catch(() => null);
      if (src !== null && !/setupFiles:\s*\[[^\]]*['"]reflect-metadata['"]/.test(src))
        offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
