#!/usr/bin/env node
// Rewrites tools/create-icore/_template-shell/package.json from the repo's root
// package.json: every dependency present in BOTH gets the root's version spec.
// The shell is the root package.json of every generated project, but it is
// hand-maintained and silently drifts (the repo moved to Nx 23 / ESLint 10 /
// vitest 5 while generated projects stayed on Nx 22 / ESLint 9 / vitest 4).
// `template-shell-drift.unit.test.ts` fails when they diverge; this fixes it.
//
// Only the version spec of shared names changes. Shell-only dependencies, the
// file's structure and range prefixes that already agree on the version
// (e.g. `^6.0.3` vs `6.0.3`) are left alone.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rootPath = resolve(here, '../../../package.json');
const shellPath = resolve(here, '../_template-shell/package.json');

const root = JSON.parse(readFileSync(rootPath, 'utf8'));
const shell = JSON.parse(readFileSync(shellPath, 'utf8'));

const rootSpecs = { ...root.dependencies, ...root.devDependencies };
const version = (spec) => spec.replace(/^[\^~]/, '');

let changed = 0;
for (const section of ['dependencies', 'devDependencies']) {
  for (const [name, spec] of Object.entries(shell[section] ?? {})) {
    const rootSpec = rootSpecs[name];
    if (rootSpec === undefined || version(rootSpec) === version(spec)) continue;
    shell[section][name] = rootSpec;
    changed++;
  }
}

writeFileSync(shellPath, JSON.stringify(shell, null, 2) + '\n');
console.log(`_template-shell/package.json: ${changed} dependency version(s) synced from the root.`);
