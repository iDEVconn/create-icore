import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, '..');

const res = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: pkgDir,
  encoding: 'utf8',
});

if (res.status !== 0 || !res.stdout) {
  console.error('Failed to run npm pack --dry-run:', res.stderr);
  process.exit(1);
}

const packData = JSON.parse(res.stdout);
const files = new Set(packData[0]?.files?.map((f) => f.path) ?? []);

const REQUIRED_TEMPLATES = [
  'templates/_yarnrc.yml',
  'templates/_gitignore',
  'templates/_github/workflows/ci.yml',
];

const missing = REQUIRED_TEMPLATES.filter((p) => !files.has(p));

if (missing.length > 0) {
  console.error('ERROR: Required dotfiles are missing from the npm package tarball:');
  for (const m of missing) {
    console.error(`  - ${m}`);
  }
  process.exit(1);
}

console.log(
  '✅ All required template dotfiles (_yarnrc.yml, _gitignore, _github) present in tarball.',
);
