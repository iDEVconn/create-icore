#!/usr/bin/env node
// G0 measurement: cold starts, warm latency, CPU (from `wrangler tail`), Durable Object round trip.
// All output goes through the redactor; credentials are only handed to wrangler child processes.
import { spawn, spawnSync } from 'node:child_process';
import https from 'node:https';
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

export function tally(statuses) {
  const byStatus = {};
  for (const st of statuses) byStatus[st] = (byStatus[st] ?? 0) + 1;
  const ok = byStatus[200] ?? 0;
  return {
    total: statuses.length,
    ok,
    okRate: statuses.length ? ok / statuses.length : 0,
    byStatus,
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

// `wrangler tail --format json` prints pretty-printed objects, not one per line. Pull every
// complete top-level {...} out of a text buffer (string-aware) and return the unparsed rest.
export function extractJsonObjects(buffer) {
  const objects = [];
  let i = 0;
  let consumed = 0;
  while (i < buffer.length) {
    const start = buffer.indexOf('{', i);
    if (start < 0) {
      consumed = buffer.length;
      break;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let k = start; k < buffer.length; k++) {
      const ch = buffer[k];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        end = k;
        break;
      }
    }
    if (end < 0) {
      consumed = start;
      break;
    }
    try {
      objects.push(JSON.parse(buffer.slice(start, end + 1)));
    } catch {
      /* not JSON: skip it */
    }
    i = end + 1;
    consumed = i;
  }
  return { objects, rest: buffer.slice(consumed) };
}

export function loadCreds(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf(':');
    const label = (i > 0 ? line.slice(0, i) : '').trim().toLowerCase();
    const value = i > 0 ? line.slice(i + 1).trim() : '';
    if (/^workers( token)?$/.test(label)) out.token = value;
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
  const wranglerBin = join(root, 'node_modules/.bin/wrangler');
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
    tail = spawn(wranglerBin, ['tail', '--config', args.config, '--format', 'json'], {
      cwd: root,
      env: childEnv,
    });
    let buf = '';
    tail.stdout.on('data', (d) => {
      const { objects, rest } = extractJsonObjects(buf + d);
      buf = rest;
      events.push(...objects);
    });
    tail.on('error', () => undefined);
    await sleep(4000);
  }
  const eventFor = (needle) => events.find((e) => (e?.event?.request?.url ?? '').includes(needle));

  // One keep-alive connection at a time: the fake auth and the memory session store live inside a
  // single isolate, and separate connections can be served by different isolates (register would
  // land on one and login on another). A fresh agent per cold run also gives a fresh TLS connection.
  const target = new URL(args.url);
  let agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  const resetConnection = () => {
    agent.destroy();
    agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  };
  const request = (method, path, { body, cookie }) =>
    new Promise((resolvePromise, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = https.request(
        {
          host: target.hostname,
          port: target.port || 443,
          path,
          method,
          agent,
          timeout: 60_000,
          headers: {
            'content-type': 'application/json',
            ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
            ...(cookie ? { cookie } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolvePromise({
              status: res.statusCode,
              headers: {
                get: (name) => [].concat(res.headers[name.toLowerCase()] ?? [])[0] ?? null,
                getSetCookie: () => [].concat(res.headers['set-cookie'] ?? []),
              },
              text: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      req.on('timeout', () => req.destroy(new Error('request timeout')));
      req.on('error', reject);
      req.end(payload);
    });
  const call = async (method, path, opts = {}) => {
    for (let attempt = 0; ; attempt++) {
      const t0 = performance.now();
      try {
        const res = await request(method, path, opts);
        return { res, text: res.text, ms: performance.now() - t0 };
      } catch (err) {
        // Right after a deploy the edge may reset connections: retry network errors only.
        if (attempt >= 2) throw err;
        resetConnection();
        await sleep(1500);
      }
    }
  };

  // ---- warm: login (with retries: the fake auth and the memory session store live in one
  // isolate, so a fresh version or a different isolate can lose them), then N profile reads and
  // N Durable Object round trips. Statuses are tallied: a 401 means the session was lost.
  const creds2 = { email: `g0-${Date.now()}@example.com`, password: 'g0-password-123!' };
  let sid;
  let relogins = 0;
  let lastLogin = 'no attempt';
  const startSession = async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await call('POST', '/api/auth/register', { body: creds2 });
      const login = await call('POST', '/api/auth/login', { body: creds2 });
      lastLogin = `status ${login.res.status} ${login.text.slice(0, 120)}`;
      sid = (login.res.headers.getSetCookie?.() ?? [])
        .map((c) => c.split(';')[0])
        .find((c) => c.startsWith('icore_sid='));
      if (sid) return;
      await sleep(1500);
    }
    throw new Error(`login never set a session cookie after 6 attempts (last: ${lastLogin})`);
  };
  await startSession();
  const profileMs = [];
  const profileStatuses = [];
  const doWall = [];
  const doInWorker = [];
  const doStatuses = [];
  for (let k = 0; k < args.warmRequests; k++) {
    let p = await call('GET', `/api/profile?w=${k}`, { cookie: sid });
    if (p.res.status === 401) {
      relogins++;
      await startSession();
      p = await call('GET', `/api/profile?w=${k}`, { cookie: sid });
    }
    profileStatuses.push(p.res.status);
    if (p.res.status === 200) profileMs.push(p.ms);
    const d = await call('GET', `/g0/do?id=measure&w=${k}`);
    doStatuses.push(d.res.status);
    if (d.res.status === 200) {
      doWall.push(d.ms);
      try {
        doInWorker.push(JSON.parse(d.text).doMs);
      } catch {
        /* ignore */
      }
    }
  }

  // ---- cold runs: a fresh version per run means fresh isolates ----
  const cold = [];
  const startups = [];
  const colos = new Set();
  for (let i = 1; i <= args.coldRuns; i++) {
    resetConnection();
    const dep = spawnSync(
      wranglerBin,
      ['deploy', '--config', args.config, '--var', `G0_RUN:${i}`],
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
    profileStatuses: tally(profileStatuses),
    doStatuses: tally(doStatuses),
    relogins,
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
