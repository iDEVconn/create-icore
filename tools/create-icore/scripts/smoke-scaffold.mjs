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
//     --upload=cloudinary --transport=tcp [--session=redis|memory] --pm=yarn --mode=link --run

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
const host = args.host ?? 'node';
const projects = (
  args.projects ??
  (host === 'cloudflare'
    ? 'shared,auth,upload,notes,api,template-shared,worker'
    : 'shared,auth,upload,notes,api,template-shared')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// The Worker is part of every cloudflare scaffold: always typecheck/build it.
if (host === 'cloudflare' && !projects.includes('worker')) projects.push('worker');
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
  host,
  targetDir: '',
  authProvider: args.auth ?? 'supabase',
  dbProvider: args.db ?? (host === 'cloudflare' ? 'none' : 'supabase'),
  upload: args.upload ?? 'cloudinary',
  payment: args.payment ?? 'none',
  jobs: args.jobs ?? 'none',
  ai: args.ai ?? 'none',
  example: args.example ?? 'notes',
  ui: args.ui ?? 'shadcn',
  api: args.api ?? 'rest',
  transport: args.transport ?? (host === 'cloudflare' ? 'local' : 'tcp'),
  session: args.session ?? (host === 'cloudflare' ? 'durable-object' : 'redis'),
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
  'ai-orchestrator': 'apps/microservices/ai-orchestrator/tsconfig.app.json',
  api: 'apps/api/tsconfig.app.json',
  'template-shared': 'libs/template-shared/tsconfig.lib.json',
  client: 'apps/client/tsconfig.app.json',
  worker: 'apps/worker/tsconfig.json',
};

/**
 * One real round trip against the booted gateway's `/api/graphql` (api=graphql|both). `health` is
 * public and needs no CSRF token, so it proves the whole stack answers: Nest + Apollo + the global
 * guards + the schema. With auth a guarded field must answer HTTP 401 without a session, which
 * proves the guards run on GraphQL (a stack that serves guarded data anonymously is worse than one
 * that is down).
 */
async function probeGraphql(authProvider) {
  const port = Number(process.env.API_PORT ?? 3001);
  const post = async (query) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(3000),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    const health = await post('{ health { status } }');
    if (health.status !== 200 || health.body?.data?.health?.status !== 'ok') {
      return { done: false, reason: `health answered ${health.status}` };
    }
    if (authProvider !== 'none') {
      const guarded = await post('{ me { uid } }');
      if (guarded.status !== 401) {
        return {
          done: true,
          failed: `anonymous { me } answered HTTP ${guarded.status}, expected 401 (guards not applied to GraphQL)`,
        };
      }
    }
    return { done: true };
  } catch (err) {
    return { done: false, reason: String(err?.message ?? err) };
  }
}

/**
 * Boots `nx run-many -t serve` for the services and asserts the process stays
 * alive for `runSeconds` without printing a crash marker. In dev every service
 * must survive missing .env / down brokers (banner + fake + retry), so a clean
 * exit or a crash marker is a failure.
 */
async function bootCheck(nxBin, svcList, cwd, logPath, probe = null) {
  const { createWriteStream } = await import('node:fs');
  const out = createWriteStream(logPath);
  const child = spawn(
    'node',
    // No --skip-nx-cache here: the build phase already ran fresh builds and nx
    // cached those outputs. Re-using the cache for serve's build dependencies
    // avoids a race condition where nx runs shared:build + db-supabase:build in
    // parallel chains (both triggered by --skip-nx-cache), which fails under pnpm
    // strict isolation (no hoisted root node_modules/@icore/* as fallback).
    [nxBin, 'run-many', '-t', 'serve', '--projects=' + svcList.join(',')],
    { cwd, env: { ...process.env, NODE_ENV: 'development' }, detached: true },
  );
  child.stdout.pipe(out);
  child.stderr.pipe(out);

  let exitedEarly = null;
  child.on('exit', (code) => {
    exitedEarly = code;
  });

  // The gateway is up some time after `serve` starts (it builds first): retry the probe until it
  // answers or the window closes; a probe that answered but found a defect fails at once.
  let probeResult = probe ? { done: false, reason: 'gateway never answered' } : { done: true };
  const deadline = Date.now() + runSeconds * 1000;
  while (Date.now() < deadline) {
    if (exitedEarly !== null) break;
    if (!probeResult.done) probeResult = await probe();
    if (probeResult.failed) break;
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
  if (probeResult.failed) return { ok: false, reason: probeResult.failed, log };
  if (!probeResult.done) {
    return { ok: false, reason: `/api/graphql probe failed: ${probeResult.reason}`, log };
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

  const combo = `host=${host} auth=${opts.authProvider} db=${opts.dbProvider} upload=${opts.upload} payment=${opts.payment} jobs=${opts.jobs} ai=${opts.ai} api=${opts.api} transport=${opts.transport} session=${opts.session} pm=${pm} mode=${mode} run=${doRun}`;
  console.log(`\n=== smoke: ${combo} ===`);

  await scaffold(opts, templatesDir);
  console.log(`scaffolded → ${opts.targetDir}`);

  // Orphan-regression gate (design §7): no import of an absent @icore lib, no
  // forbidden raw SDK dep for an unchosen provider (derived from blueprint.json).
  const { auditProject } = require(distEntry);
  const auditViolations = await auditProject(opts.targetDir);
  if (auditViolations.length > 0) {
    for (const v of auditViolations) console.error(`AUDIT ${v.kind}: ${v.detail}`);
    console.error(
      `\n✗ smoke FAILED (${combo}) — audit found ${auditViolations.length} orphan(s). inspect: ${opts.targetDir}`,
    );
    process.exit(1);
  }
  console.log(`✓ audit clean (${combo})`);

  if (mode === 'link') {
    // Layer A — typecheck only. nx build/serve executors validate
    // externalDependencies against the workspace package graph (which a
    // no-install symlink can't satisfy), so we drive `tsc --noEmit` directly:
    // it resolves @icore/* via tsconfig paths and npm types via the symlinked
    // node_modules, catching TS2304 / dangling-reference breakage.
    await symlink(join(repoRoot, 'node_modules'), join(opts.targetDir, 'node_modules'), 'dir');
    const tsc = resolveBin(repoRoot, 'typescript', 'tsc');
    let failed = false;
    // The client is typechecked here (cheap: tsc only) but is not in `projects`, which also drives
    // the install-mode nx build/lint. Skipped by the existsSync check below for --ui=none.
    const typecheckProjects = projects.includes('client') ? projects : [...projects, 'client'];
    for (const proj of typecheckProjects) {
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
        if (specPath !== tsconfigPath && existsSync(specPath)) configs.push(specPath);
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
    await rm(dir, { recursive: true, force: true }).catch(() => {});
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

  if (doRun && host === 'cloudflare') {
    // The Worker is not a Node service: run its own end-to-end smoke (wrangler dev --local, workerd).
    console.log('\n--- worker smoke (wrangler dev --local) ---');
    const code = run('node', [nxBin, 'run', 'worker:smoke', '--skip-nx-cache'], opts.targetDir);
    if (code !== 0) {
      console.error(`\n✗ smoke FAILED (${combo}) — worker smoke red. inspect: ${opts.targetDir}`);
      process.exit(code);
    }
  } else if (doRun) {
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
      // api=graphql|both with a gateway in the boot set: also prove /api/graphql answers.
      const probe =
        present.includes('api') && opts.api !== 'rest'
          ? () => probeGraphql(opts.authProvider)
          : null;
      const res = await bootCheck(nxBin, present, opts.targetDir, join(dir, 'serve.log'), probe);
      if (!res.ok) {
        console.error(`\n✗ smoke FAILED (${combo}) — ${res.reason}`);
        console.error(`--- serve log tail ---\n${res.log.split('\n').slice(-200).join('\n')}`);
        console.error(`inspect: ${opts.targetDir}`);
        process.exit(1);
      }
      console.log(
        `✓ services stayed up ${runSeconds}s, no crash${probe ? ', /api/graphql answered' : ''}`,
      );
    }
  }

  console.log(`\n✓ smoke OK (${combo})`);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
