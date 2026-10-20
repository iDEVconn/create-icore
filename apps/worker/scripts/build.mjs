// Compiles the worker and every repo source it imports with `tsc`, because Wrangler's esbuild does
// not emit `emitDecoratorMetadata` and iCore relies on implicit constructor injection (a class
// built without it gets `undefined` dependencies, silently). Then writes `tsconfig.bundle.json`
// so Wrangler resolves `@icore/*` to the compiled JS, not the TS source.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const tsc = join(repo, 'node_modules/typescript/bin/tsc');

rmSync(join(root, 'build'), { recursive: true, force: true });
const r = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
  cwd: root,
  encoding: 'utf8',
});
mkdirSync(join(root, 'build'), { recursive: true });
const diagnostics = `${r.stdout ?? ''}${r.stderr ?? ''}`;
const typeErrors = diagnostics.split('\n').filter((l) => /error TS/.test(l));
writeFileSync(join(root, 'build/tsc-errors.txt'), diagnostics);
console.log(`tsc: ${typeErrors.length} type error(s) (see build/tsc-errors.txt)`);
// Emit continues past type errors; the lint/typecheck targets are the gate for those. A hard
// failure here is an entry that was not emitted at all.
const entry = join(root, 'build/apps/worker/src/index.js');
if (!existsSync(entry)) {
  console.error(`build FAILED: ${entry} was not emitted`);
  process.exit(1);
}

const base = JSON.parse(readFileSync(join(repo, 'tsconfig.base.json'), 'utf8'));
const paths = {};
for (const [alias, [target]] of Object.entries(base.compilerOptions.paths ?? {})) {
  if (!/\.tsx?$/.test(target)) continue;
  paths[alias] = [`./build/${target.replace(/^\.\//, '').replace(/\.tsx?$/, '.js')}`];
}
writeFileSync(
  join(root, 'tsconfig.bundle.json'),
  JSON.stringify({ compilerOptions: { baseUrl: '.', paths } }, null, 2),
);
console.log(`bundle tsconfig: ${Object.keys(paths).length} @icore aliases → build/`);
