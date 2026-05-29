import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(here, '..', 'templates');

const PATHS_TO_COPY = [
  'apps/api',
  'apps/microservices/auth',
  'apps/microservices/upload',
  'apps/microservices/payment',
  'apps/microservices/notes',
  'apps/microservices/jobs',
  'apps/templates',
  'libs',
  'tools/create-icore/_template-shell',
  'tsconfig.base.json',
  'nx.json',
  '.gitignore',
  '.nvmrc',
  '.prettierrc',
  '.prettierignore',
  '.yarnrc.yml',
  '.yarn/releases',
  'eslint.config.mjs',
  '.husky/pre-commit',
  'Dockerfile.gateway',
  'Dockerfile.ms-auth',
  'Dockerfile.ms-upload',
  'Dockerfile.ms-jobs',
  'docker-compose.yml',
  '.env.docker.example',
  '.dockerignore',
  'tools/remove-notes.mjs',
];

const SHELL_OVERRIDES = ['package.json'];

const IGNORE_REL = new Set([
  'node_modules',
  '.nx',
  'dist',
  '.yarn/cache',
  '.yarn/unplugged',
  '.yarn/install-state.gz',
  'coverage',
  'tmp',
]);

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  for (const rel of PATHS_TO_COPY) {
    const src = resolve(root, rel);
    const dest = resolve(out, rel);
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest, {
      recursive: true,
      filter: (entry) => {
        const r = entry.replace(root + '/', '');
        for (const ig of IGNORE_REL) if (r.includes(`/${ig}`) || r === ig) return false;
        return true;
      },
    });
  }

  // shell-level overrides — a curated package.json that strips devDeps and
  // tools-specific scripts; copied LAST so it wins.
  for (const f of SHELL_OVERRIDES) {
    const shell = resolve(here, '..', '_template-shell', f);
    const dest = resolve(out, f);
    await cp(shell, dest);
  }

  console.log(`Templates written to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
