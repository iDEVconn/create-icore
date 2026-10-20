#!/usr/bin/env node
// G0 measurement: cold starts, warm latency, CPU (from `wrangler tail`), Durable Object round trip.
// All output goes through the redactor; credentials are only handed to wrangler child processes.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRedactor } from './redact.mjs';

export const THRESHOLDS = {
  startupMs: 400, // reported "Worker Startup Time" (platform hard limit: 1000)
  coldMaxMs: 2000, // slowest cold first request, wall time from the client
  warmCpuP99Ms: 30, // warm GET /api/profile CPU, p99
  doP95Ms: 40, // warm Durable Object round trip, p95
  bundleMiB: 10, // uncompressed bundle
};

export function percentile(values, p) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

export function summarize(values) {
  if (!values.length) return { n: 0 };
  return {
    n: values.length,
    min: Math.min(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: Math.max(...values),
  };
}

export function renderTable(rows) {
  const lines = ['| Check | Value | Threshold | Result |', '|---|---|---|---|'];
  for (const { name, value, unit, max } of rows) {
    const shown = value === undefined ? 'n/a' : `${Number(value).toFixed(1)} ${unit}`;
    const result = value === undefined ? 'NOT MEASURED' : value > max ? 'FAIL' : 'PASS';
    lines.push(`| ${name} | ${shown} | ≤ ${max} ${unit} | ${result} |`);
  }
  return lines.join('\n');
}

export function loadCreds(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf(':');
    const label = (i > 0 ? line.slice(0, i) : '').trim().toLowerCase();
    const value = i > 0 ? line.slice(i + 1).trim() : '';
    if (/workers token/.test(label)) out.token = value;
    else if (/account id/.test(label)) out.accountId = value;
    else if (!out.accountId && label.startsWith('http'))
      out.accountId = (line.match(/[0-9a-f]{32}/) ?? [])[0];
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = {
    coldRuns: 5,
    warmRequests: 200,
    config: 'wrangler.jsonc',
    out: 'results.json',
    tail: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--cold-runs') args.coldRuns = Number(argv[++i]);
    else if (a === '--warm-requests') args.warmRequests = Number(argv[++i]);
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--creds') args.creds = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--no-tail') args.tail = false;
    else if (a === '--help') args.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

const USAGE = `usage: node scripts/measure.mjs --url <https://worker.example.workers.dev> [options]
  --cold-runs <n>        fresh-version cold first requests (default 5; 0 = skip deploys)
  --warm-requests <n>    warm requests per route (default 200)
  --config <file>        wrangler config used for deploy/tail (default wrangler.jsonc)
  --creds <file>         "Label: value" file with "Workers token" and "Account ID" (never printed)
  --out <file>           results json (default results.json, gitignored)
  --no-tail              skip wrangler tail (CPU time then shows as NOT MEASURED)`;

export async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) return console.log(USAGE);
  if (!args.url) throw new Error('--url is required');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const creds = args.creds ? loadCreds(args.creds) : {};
  const redact = buildRedactor({ secrets: [creds.token, creds.accountId] });
  const log = (...a) => console.log(redact(a.join(' ')));
  const childEnv = {
    ...process.env,
    ...(creds.token ? { CLOUDFLARE_API_TOKEN: creds.token } : {}),
    ...(creds.accountId ? { CLOUDFLARE_ACCOUNT_ID: creds.accountId } : {}),
  };

  // ---- wrangler tail: CPU / wall time per request, keyed by a unique query param ----
  const events = [];
  let tail;
  if (args.tail) {
    tail = spawn('npx', ['wrangler', 'tail', '--config', args.config, '--format', 'json'], {
      cwd: root,
      env: childEnv,
    });
    let buf = '';
    tail.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          events.push(JSON.parse(line));
        } catch {
          /* not an event line */
        }
      }
    });
    tail.on('error', () => undefined);
    await sleep(4000);
  }
  const eventFor = (needle) => events.find((e) => (e?.event?.request?.url ?? '').includes(needle));

  const call = async (method, path, { body, cookie } = {}) => {
    const t0 = performance.now();
    const res = await fetch(`${args.url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    return { res, text, ms: performance.now() - t0 };
  };

  // ---- cold runs: a fresh version per run means fresh isolates ----
  const cold = [];
  const startups = [];
  const colos = new Set();
  for (let i = 1; i <= args.coldRuns; i++) {
    const dep = spawnSync(
      'npx',
      ['wrangler', 'deploy', '--config', args.config, '--var', `G0_RUN:${i}`],
      {
        cwd: root,
        env: childEnv,
        encoding: 'utf8',
      },
    );
    const startup = Number(
      (/Worker Startup Time:\s*([\d.]+)\s*ms/.exec(`${dep.stdout}${dep.stderr}`) ?? [])[1],
    );
    if (dep.status !== 0)
      throw new Error(`deploy ${i} failed: ${redact(`${dep.stderr}`.slice(0, 400))}`);
    if (Number.isFinite(startup)) startups.push(startup);
    await sleep(3000);
    const first = await call('GET', `/g0/health?cold=${i}`);
    const ray = first.res.headers.get('cf-ray') ?? '';
    if (ray.includes('-')) colos.add(ray.split('-')[1]);
    const warmAfter = [];
    for (let k = 0; k < 3; k++)
      warmAfter.push((await call('GET', `/g0/health?after=${i}-${k}`)).ms);
    cold.push({ run: i, firstMs: first.ms, warmMs: percentile(warmAfter, 50), startupMs: startup });
    log(
      `cold ${i}/${args.coldRuns}: first ${first.ms.toFixed(0)} ms, warm ${percentile(warmAfter, 50).toFixed(0)} ms`,
    );
  }

  // ---- warm: login once, then N profile reads and N Durable Object round trips ----
  const creds2 = { email: `g0-${Date.now()}@example.com`, password: 'g0-password-123!' };
  await call('POST', '/api/auth/register', { body: creds2 });
  const login = await call('POST', '/api/auth/login', { body: creds2 });
  const sid = (login.res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('icore_sid='));
  if (!sid) throw new Error(`login did not set a session cookie (status ${login.res.status})`);
  const profileMs = [];
  const doWall = [];
  const doInWorker = [];
  for (let k = 0; k < args.warmRequests; k++) {
    profileMs.push((await call('GET', `/api/profile?w=${k}`, { cookie: sid })).ms);
    const d = await call('GET', `/g0/do?id=measure&w=${k}`);
    doWall.push(d.ms);
    try {
      doInWorker.push(JSON.parse(d.text).doMs);
    } catch {
      /* ignore */
    }
  }

  if (tail) {
    await sleep(4000);
    tail.kill();
  }
  const cpuOf = (needle) => {
    const e = eventFor(needle);
    return e && typeof e.cpuTime === 'number' ? e.cpuTime : undefined;
  };
  const coldCpu = cold.map((c) => cpuOf(`cold=${c.run}`)).filter((v) => v !== undefined);
  const warmCpu = Array.from({ length: args.warmRequests }, (_, k) =>
    cpuOf(`/api/profile?w=${k}`),
  ).filter((v) => v !== undefined);

  const bundlePath = join(root, 'dist-dry/index.js');
  const bundleMiB = existsSync(bundlePath) ? statSync(bundlePath).size / (1024 * 1024) : undefined;
  const results = {
    colos: [...colos],
    startups,
    cold,
    coldCpu,
    profileWallMs: summarize(profileMs),
    profileCpuMs: summarize(warmCpu),
    doWallMs: summarize(doWall),
    doInWorkerMs: summarize(doInWorker),
    bundleMiB,
  };
  writeFileSync(join(root, args.out), redact(JSON.stringify(results, null, 2)));

  const table = renderTable([
    {
      name: 'Worker Startup Time (max of deploys)',
      value: startups.length ? Math.max(...startups) : undefined,
      unit: 'ms',
      max: THRESHOLDS.startupMs,
    },
    {
      name: 'Slowest cold first request (wall)',
      value: cold.length ? Math.max(...cold.map((c) => c.firstMs)) : undefined,
      unit: 'ms',
      max: THRESHOLDS.coldMaxMs,
    },
    {
      name: 'Warm GET /api/profile CPU p99',
      value: results.profileCpuMs.p99,
      unit: 'ms',
      max: THRESHOLDS.warmCpuP99Ms,
    },
    {
      name: 'Warm Durable Object round trip p95 (in Worker)',
      value: results.doInWorkerMs.p95,
      unit: 'ms',
      max: THRESHOLDS.doP95Ms,
    },
    { name: 'Uncompressed bundle', value: bundleMiB, unit: 'MiB', max: THRESHOLDS.bundleMiB },
  ]);
  log(`\n${table}\n`);
  log(
    `colos seen: ${results.colos.join(', ') || 'n/a'}; cold CPU samples: ${coldCpu.length}; warm CPU samples: ${warmCpu.length}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`measure failed: ${e.message}`);
    process.exit(1);
  });
}
