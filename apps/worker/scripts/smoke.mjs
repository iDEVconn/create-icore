// End-to-end smoke of the Worker under `wrangler dev --local` (workerd + Miniflare Durable Objects):
// the gateway and the auth/upload/notes microservices in one isolate over the local transport.
// Uses the fake providers (NODE_ENV is forced to "production" on a deployed Worker, so the dev
// fallback is enabled here with a bundle-time define). Run: `yarn nx run worker:smoke`.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.WORKER_SMOKE_PORT ?? 8799);
const base = `http://localhost:${port}`;

// Which features this project hosts (create-icore generates the vars per project).
const wranglerText = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
const hasAuth = /"AUTH_TRANSPORT"/.test(wranglerText);
const hasUpload = /"UPLOAD_TRANSPORT"/.test(wranglerText);
const hasNotes = /"NOTES_TRANSPORT"/.test(wranglerText);

writeFileSync(join(root, '.dev.vars'), 'AUTH_TCP_SECRET=smoke-only\n');
const dev = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    '--local',
    '--port',
    String(port),
    // Fresh Durable Object / D1 state per run: rate-limit counters from an earlier run would leak in.
    '--persist-to',
    mkdtempSync(join(tmpdir(), 'worker-smoke-')),
    '--define',
    'process.env.NODE_ENV:"development"',
  ],
  { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
dev.stdout.on('data', (d) => (log += d));
dev.stderr.on('data', (d) => (log += d));
const stop = () => {
  try {
    process.kill(-dev.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stop);

let failed = 0;
const check = (name, cond, why = '') => {
  if (cond) console.log(`ok   ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}: ${why}`);
  }
};

const deadline = Date.now() + 120_000;
while (!/Ready on/.test(log)) {
  if (Date.now() > deadline || /Build failed/.test(log)) {
    console.error(`wrangler dev did not start:\n${log.slice(-3000)}`);
    stop();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}

const jar = new Map();
const absorb = (res) => {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    const [k, v] = [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
    if (v === '' || /max-age=0/i.test(line)) jar.delete(k);
    else jar.set(k, v);
  }
};
async function call(method, path, { body, csrf, cookie } = {}) {
  const headers = {
    'content-type': 'application/json',
    cookie: cookie ?? [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
  };
  if (csrf) headers['x-csrf-token'] = jar.get('icore_csrf') ?? '';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  absorb(res);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text, headers: res.headers };
}

try {
  if (!hasAuth) {
    // No auth: nothing is session-protected. Prove the gateway booted and the throttler guard runs.
    let r = await call('GET', '/api/does-not-exist');
    check(
      'gateway booted (unknown route answers 404, not a crash)',
      r.status === 404,
      `${r.status}`,
    );
    if (hasUpload) {
      // A real route, so the guards run: the throttler guard must be registered even without AuthModule.
      r = await call('GET', '/api/storage/signed-url?bucket=smoke&path=smoke');
      check(
        'the throttler guard runs without AuthModule',
        !!r.headers.get('x-ratelimit-limit'),
        `${r.status} ${r.headers.get('x-ratelimit-limit')}`,
      );
    }
  } else {
    const creds = { email: `smoke-${Date.now()}@example.com`, password: 'smoke-password-123!' };

    let r = await call('GET', '/api/auth/session');
    check('anonymous session is 401 (gateway booted, guards run)', r.status === 401, `${r.status}`);
    check(
      'throttler headers come from the Durable Object storage',
      r.headers.get('x-ratelimit-limit') === '120',
      String(r.headers.get('x-ratelimit-limit')),
    );

    r = await call('POST', '/api/auth/register', { body: creds });
    check(
      'register reaches the auth microservice over the local transport',
      r.status < 300,
      `${r.status} ${r.text.slice(0, 160)}`,
    );
    jar.clear();

    r = await call('POST', '/api/auth/login', { body: creds });
    check(
      'login sets session + csrf cookies',
      r.status < 300 && jar.has('icore_sid') && jar.has('icore_csrf'),
      `${r.status} ${[...jar.keys()]} ${r.text.slice(0, 160)}`,
    );
    check(
      'session id is the Durable Object form <b64 uid>.<random>',
      /^[\w-]+\.[\w-]{40,}$/.test(jar.get('icore_sid') ?? ''),
      jar.get('icore_sid') ?? '',
    );

    r = await call('GET', '/api/auth/session');
    check(
      'session resolves the user from the Durable Object',
      r.status === 200 && r.json?.user?.email === creds.email,
      `${r.status} ${r.text.slice(0, 160)}`,
    );

    r = await call('GET', '/api/profile');
    check('profile (AuthGuard + CASL)', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`);

    r = await call('POST', '/api/auth/admin/revoke-user/someone');
    check(
      'mutating route without X-CSRF-Token is rejected',
      r.status === 403 && /csrf_mismatch/.test(r.text),
      `${r.status} ${r.text.slice(0, 160)}`,
    );

    if (hasNotes) {
      r = await call('POST', '/api/notes', {
        body: { title: 'smoke', content: 'hello' },
        csrf: true,
      });
      const id = r.json?.id;
      check(
        'create a note through the notes microservice',
        r.status < 300 && !!id,
        `${r.status} ${r.text.slice(0, 160)}`,
      );

      r = await call('GET', '/api/notes');
      check(
        'list returns the note',
        r.status === 200 && JSON.stringify(r.json).includes('smoke'),
        `${r.status} ${r.text.slice(0, 160)}`,
      );

      r = await call('DELETE', `/api/notes/${id}`, { csrf: true });
      check('delete the note', r.status < 300, `${r.status} ${r.text.slice(0, 160)}`);
    }

    const sid = jar.get('icore_sid');
    r = await call('POST', '/api/auth/logout', { csrf: true });
    check('logout', r.status < 300, `${r.status} ${r.text.slice(0, 160)}`);
    r = await call('GET', '/api/auth/session', { cookie: `icore_sid=${sid}` });
    check(
      'the session is gone from the Durable Object after logout (401)',
      r.status === 401,
      `${r.status}`,
    );

    // auth-burst allows 10 requests/minute per client: the 11th login is limited, so the counter
    // really lives in the ThrottleDurableObject.
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      statuses.push(
        (
          await call('POST', '/api/auth/login', {
            body: { email: 'nobody@example.com', password: 'wrong-password-1' },
          })
        ).status,
      );
    }
    check(
      'login is rate limited (429) by the Durable Object throttler',
      statuses.includes(429),
      statuses.join(','),
    );
  }
} finally {
  stop();
}

if (failed) {
  console.error(`${failed} check(s) failed\n--- wrangler log tail ---\n${log.slice(-2500)}`);
  process.exit(1);
}
console.log('worker smoke: all checks ok');
process.exit(0);
