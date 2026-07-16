import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { buildRegistry } from '../src/migrations/build-registry.js';
import { createGitDeps } from '../src/migrations/git-deps.js';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '../../..');
  const deps = await createGitDeps(repoRoot);
  const registry = await buildRegistry(deps);
  const outPath = join(repoRoot, 'tools/create-icore/migrations/registry.json');
  await writeFile(outPath, JSON.stringify(registry, null, 2) + '\n');
  const count = registry.entries.length;
  console.log(`Wrote ${count} migration entr${count === 1 ? 'y' : 'ies'} to ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
