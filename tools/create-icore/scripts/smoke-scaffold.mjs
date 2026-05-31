#!/usr/bin/env node
// Scaffold → build → RUN smoke test.
//
// Generates a real project from the committed `templates/` snapshot, then
// builds it AND boots the services. Build alone is not enough — the bugs that
// actually bite (crash on missing .env, transport broker down, payment/ jobs
// startup crashes) only surface at RUNTIME. In dev the services must degrade
// gracefully (banner + fake/retry), never `process.exit(1)`; this asserts that.
//
// Fidelity modes:
//   --mode=link     (Layer A, cheap, every PR) symlink this repo's node_modules
//                   into the generated workspace — no install, no network.
//   --mode=install  (Layer B, matrix/nightly) real package-manager install
//                   first — also catches lockfile / dep-pruning / pm-runner.
//
// Phases (default: build only; pass --run to add the boot phase):
//   build : nx run-many -t build,lint over the focused projects.
//   run   : nx run-many -t serve over the services; assert each stays up for
//           --run-seconds without exiting or logging a crash marker.
//
// Usage:
//   node scripts/smoke-scaffold.mjs --auth=supabase --db=supabase \
//     --upload=cloudinary --transport=tcp --pm=yarn --mode=link --run

import { createRequire } from 'node:module';
import { mkdtemp, rm, symlink, mkdir, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, '..');
const repoRoot = resolve(cliRoot, '..', '..');
const templatesDir = join(cliRoot, 'templates');
const distEntry = join(cliRoot, 'dist', 'index.cjs');

const CRASH_MARKERS = [
  'Process exited with code 1',
  'bootstrap failed',
  'Cannot find module',
  'Cannot find name',
  'UnhandledPromiseRejection',
  'Error: Could not find',
];

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const [k, v = 'true'] = a.slice(2).split('=', 2);
    out[k] = v;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? 'link';
const pm = args.pm ?? 'yarn';
const doRun = args.run === 'true' || args.run === '';
// Lint defaults ON in install mode (real node_modules → eslint resolves); pass
// --lint=false to skip. Ignored in link mode (nx lint needs a real install).
const doLint = mode === 'install' && args.lint !== 'false';
const runSeconds = Number(args['run-seconds'] ?? 20);
const projects = (args.projects ?? 'shared,auth,upload,notes,api')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const services = (args.services ?? 'api,auth,upload,notes')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const targets = (args.targets ?? 'build')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const opts = {
  projectName: 'smoke-app',
  targetDir: '',
  authProvider: args.auth ?? 'supabase',
  dbProvider: args.db ?? 'supabase',
  upload: args.upload ?? 'cloudinary',
  payment: args.payment ?? 'none',
  jobs: args.jobs ?? 'none',
  example: args.example ?? 'notes',
  ui: args.ui ?? 'shadcn',
  transport: args.transport ?? 'tcp',
  packageManager: pm,
  initGit: false,
  install: false,
};

function run(cmd, cmdArgs, cwd) {
  process.stdout.write(`\n$ ${cmd} ${cmdArgs.join(' ')}  (cwd=${cwd})\n`);
  return spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', env: process.env }).status ?? 1;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve a package's bin entry from a node_modules root (version-proof).
function resolveBin(base, pkg, binName) {
  const req = createRequire(join(base, 'noop.js'));
  const pkgPath = req.resolve(`${pkg}/package.json`);
  const bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin;
  const rel = typeof bin === 'string' ? bin : bin[binName];
  return resolve(dirname(pkgPath), rel);
}

// project name → the tsconfig that types its build output.
const TSCONFIG = {
  shared: 'libs/shared/tsconfig.lib.json',
  'firebase-admin': 'libs/firebase-admin/tsconfig.lib.json',
  auth: 'apps/microservices/auth/tsconfig.app.json',
  upload: 'apps/microservices/upload/tsconfig.app.json',
  notes: 'apps/microservices/notes/tsconfig.app.json',
  payment: 'apps/microservices/payment/tsconfig.app.json',
  jobs: 'apps/microservices/jobs/tsconfig.app.json',
  api: 'apps/api/tsconfig.app.json',
  client: 'apps/client/tsconfig.app.json',
};

/**
 * Boots `nx run-many -t serve` for the services and asserts the process stays
 * alive for `runSeconds` without printing a crash marker. In dev every service
 * must survive missing .env / down brokers (banner + fake + retry), so a clean
 * exit or a crash marker is a failure.
 */
async function bootCheck(nxBin, svcList, cwd, logPath) {
  const { createWriteStream } = await import('node:fs');
  const out = createWriteStream(logPath);
  const child = spawn(
    'node',
    [nxBin, 'run-many', '-t', 'serve', '--projects=' + svcList.join(','), '--skip-nx-cache'],
    { cwd, env: { ...process.env, NODE_ENV: 'development' }, detached: true },
  );
  child.stdout.pipe(out);
  child.stderr.pipe(out);

  let exitedEarly = null;
  child.on('exit', (code) => {
    exitedEarly = code;
  });

  const deadline = Date.now() + runSeconds * 1000;
  while (Date.now() < deadline) {
    if (exitedEarly !== null) break;
    await delay(1000);
  }

  // Tear down the whole process group.
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    /* already gone */
  }

  const log = existsSync(logPath) ? await readFile(logPath, 'utf8') : '';
  const hit = CRASH_MARKERS.find((m) => log.includes(m));

  if (exitedEarly !== null) {
    return { ok: false, reason: `serve exited early (code ${exitedEarly})`, log };
  }
  if (hit) {
    return { ok: false, reason: `crash marker in serve output: "${hit}"`, log };
  }
  return { ok: true };
}

async function main() {
  if (!existsSync(templatesDir)) {
    console.error(`Templates missing: ${templatesDir} — run snapshot-templates.mjs first.`);
    process.exit(1);
  }
  if (!existsSync(distEntry)) {
    console.error(`CLI dist missing: ${distEntry} — build create-icore first.`);
    process.exit(1);
  }

  const require = createRequire(import.meta.url);
  const { scaffold } = require(distEntry);

  const dir = await mkdtemp(join(tmpdir(), 'icore-smoke-'));
  opts.targetDir = join(dir, opts.projectName);
  await mkdir(opts.targetDir, { recursive: true });

  const combo = `auth=${opts.authProvider} db=${opts.dbProvider} upload=${opts.upload} payment=${opts.payment} jobs=${opts.jobs} transport=${opts.transport} pm=${pm} mode=${mode} run=${doRun}`;
  console.log(`\n=== smoke: ${combo} ===`);

  await scaffold(opts, templatesDir);
  console.log(`scaffolded → ${opts.targetDir}`);

  if (mode === 'link') {
    // Layer A — typecheck only. nx build/serve executors validate
    // externalDependencies against the workspace package graph (which a
    // no-install symlink can't satisfy), so we drive `tsc --noEmit` directly:
    // it resolves @icore/* via tsconfig paths and npm types via the symlinked
    // node_modules, catching TS2304 / dangling-reference breakage.
    await symlink(join(repoRoot, 'node_modules'), join(opts.targetDir, 'node_modules'), 'dir');
    const tsc = resolveBin(repoRoot, 'typescript', 'tsc');
    let failed = false;
    for (const proj of projects) {
      const rel = TSCONFIG[proj];
      if (!rel) {
        console.error(`  (skip ${proj}: no tsconfig mapping)`);
        continue;
      }
      const tsconfigPath = join(opts.targetDir, rel);
      if (!existsSync(tsconfigPath)) {
        console.log(`  (skip ${proj}: ${rel} not in this combo)`);
        continue;
      }
      // Typecheck the build config, plus the app's test (spec) config when
      // present: app spec configs carry their own moduleResolution/types for
      // vitest and broke independently (TS2792 "cannot find vitest"), so they
      // need their own gate. Lib spec configs are skipped — they're jest-based
      // or carry test-code strictness nits that vitest itself tolerates.
      const configs = [tsconfigPath];
      if (rel.startsWith('apps/')) {
        const specPath = tsconfigPath.replace(/\.app\.json$/, '.spec.json');
        if (existsSync(specPath)) configs.push(specPath);
      }
      for (const cfg of configs) {
        const code = run('node', [tsc, '--noEmit', '-p', cfg], opts.targetDir);
        if (code !== 0) failed = true;
      }
    }
    if (failed) {
      console.error(`\n✗ smoke FAILED (${combo}) — typecheck red. inspect: ${opts.targetDir}`);
      process.exit(1);
    }
    console.log(`\n✓ smoke OK — typecheck clean (${combo})`);
    await rm(dir, { recursive: true, force: true });
    return;
  }

  // Layer B — real install, real build, real boot.
  // yarn 4 auto-enables --immutable when CI=true, but a fresh generated project
  // has an empty yarn.lock (populated on first install) → YN0028 without the flag.
  const installArgs = pm === 'yarn' ? ['install', '--no-immutable'] : ['install'];
  if (run(pm, installArgs, opts.targetDir) !== 0) {
    console.error(`\n✗ ${pm} install failed (${combo})`);
    process.exit(1);
  }
  const nxBin = resolveBin(opts.targetDir, 'nx', 'nx');

  const buildCode = run(
    'node',
    [nxBin, 'run-many', '-t', ...targets, '--projects=' + projects.join(','), '--skip-nx-cache'],
    opts.targetDir,
  );
  if (buildCode !== 0) {
    console.error(`\n✗ smoke FAILED (${combo}) — build red. inspect: ${opts.targetDir}`);
    process.exit(buildCode);
  }

  // Lint the generated projects (real install → eslint + plugins resolve).
  // Catches lint regressions (unused vars, deprecated APIs, style) that the
  // typecheck-only Layer A can't see.
  if (doLint) {
    const lintCode = run(
      'node',
      [nxBin, 'run-many', '-t', 'lint', '--projects=' + projects.join(','), '--skip-nx-cache'],
      opts.targetDir,
    );
    if (lintCode !== 0) {
      console.error(`\n✗ smoke FAILED (${combo}) — lint red. inspect: ${opts.targetDir}`);
      process.exit(lintCode);
    }
  }

  if (doRun) {
    // Trim to services that this combo actually generated (e.g. upload=none /
    // example=none / payment=none drop their microservice).
    const present = services.filter((s) => {
      const appDir = s === 'api' ? 'apps/api' : `apps/microservices/${s}`;
      return existsSync(join(opts.targetDir, appDir));
    });
    if (present.length === 0) {
      console.log('\n--- no services in this combo to boot, skipping run phase ---');
    } else {
      console.log(`\n--- booting services (${present.join(', ')}) for ${runSeconds}s ---`);
      const res = await bootCheck(nxBin, present, opts.targetDir, join(dir, 'serve.log'));
      if (!res.ok) {
        console.error(`\n✗ smoke FAILED (${combo}) — ${res.reason}`);
        console.error(`--- serve log tail ---\n${res.log.split('\n').slice(-40).join('\n')}`);
        console.error(`inspect: ${opts.targetDir}`);
        process.exit(1);
      }
      console.log(`✓ services stayed up ${runSeconds}s, no crash`);
    }
  }

  console.log(`\n✓ smoke OK (${combo})`);
  await rm(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
