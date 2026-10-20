import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { buildRegistry } from '../src/migrations/build-registry.js';
import { createGitDeps } from '../src/migrations/git-deps.js';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '../../..');
  const deps = await createGitDeps(repoRoot);
  const registry = await buildRegistry(deps);
  const outPath = join(repoRoot, 'tools/create-icore/migrations/registry.json');
  // Format with the repo's prettier config: CI runs `prettier --check` on changed json, and plain
  // JSON.stringify expands short arrays that prettier keeps on one line.
  const config = (await resolveConfig(outPath)) ?? {};
  const text = await format(JSON.stringify(registry), { ...config, filepath: outPath });
  await writeFile(outPath, text);
  const count = registry.entries.length;
  console.log(`Wrote ${count} migration entr${count === 1 ? 'y' : 'ies'} to ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
