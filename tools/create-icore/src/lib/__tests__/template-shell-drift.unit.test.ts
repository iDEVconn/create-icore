import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONGODB_DEPS, TRANSPORT_DEPS } from '../scaffold-env.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

interface PkgJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPkg(rel: string): PkgJson {
  return JSON.parse(readFileSync(resolve(repoRoot, rel), 'utf8')) as PkgJson;
}

function allDeps(pkg: PkgJson): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

// `^1.2.3` / `~1.2.3` / `1.2.3` all mean "1.2.3" here: the range prefix is a
// style choice, the version is what must not drift.
const version = (spec: string): string => spec.replace(/^[\^~]/, '');

// Intentional divergences, name → reason. Keep EMPTY unless a generated project
// genuinely needs a different version than the repo that scaffolds it.
const ALLOWED_DIVERGENCE: Record<string, string> = {};

const HOW_TO_FIX =
  'Run `node tools/create-icore/scripts/sync-template-shell.mjs` (rewrites _template-shell/package.json from the root package.json), ' +
  'and update the pinned versions in tools/create-icore/src/lib/scaffold-env.ts (TRANSPORT_DEPS / MONGODB_DEPS).';

function mismatches(
  ours: Record<string, string>,
  repo: Record<string, string>,
): { name: string; ours: string; repo: string }[] {
  return Object.keys(ours)
    .filter((name) => name in repo && !(name in ALLOWED_DIVERGENCE))
    .filter((name) => version(ours[name]) !== version(repo[name]))
    .map((name) => ({ name, ours: ours[name], repo: repo[name] }));
}

describe('generated-project versions do not drift from this repo', () => {
  const root = allDeps(readPkg('package.json'));

  // The generated project is scaffolded WITH this repo's nx.json / eslint config /
  // vitest config / tsconfigs, written for these exact versions. A stale shell
  // (e.g. Nx 22 + ESLint 9 + vitest 4 under configs for Nx 23 + ESLint 10 + vitest 5)
  // only shows up in a real install, never in link-mode smoke.
  it('_template-shell/package.json matches the root package.json for every shared dependency', () => {
    const shell = allDeps(readPkg('tools/create-icore/_template-shell/package.json'));
    expect(
      mismatches(shell, root),
      `_template-shell has drifted from the root package.json. ${HOW_TO_FIX}`,
    ).toEqual([]);
  });

  it('versions pinned in scaffold-env.ts (transport drivers, MongoDB deps) match the root where the root has them', () => {
    const pinned = { ...MONGODB_DEPS, ...Object.assign({}, ...Object.values(TRANSPORT_DEPS)) };
    expect(
      mismatches(pinned, root),
      `scaffold-env.ts pins have drifted from the root package.json. ${HOW_TO_FIX}`,
    ).toEqual([]);
  });
});
