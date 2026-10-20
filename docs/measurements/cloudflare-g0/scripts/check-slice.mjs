// Smoke check of the realistic gateway slice against a running dev server (or G0_URL).
const base = process.env.G0_URL ?? 'http://localhost:8787';
let failed = 0;
const ok = (name) => console.log(`ok   ${name}`);
const fail = (name, why) => {
  failed++;
  console.error(`FAIL ${name}: ${why}`);
};
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const absorb = (res) => {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    const [k, v] = [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
    if (v === '' || /max-age=0/i.test(line) || /expires=thu, 01 jan 1970/i.test(line))
      jar.delete(k);
    else jar.set(k, v);
  }
};
async function call(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: cookieHeader(), ...headers },
    signal: AbortSignal.timeout(60_000),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((e) => ({
    status: 0,
    text: async () => `unreachable: ${e.message}`,
    headers: new Headers(),
  }));
  absorb(res);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text };
}
const expect = (name, cond, why) => (cond ? ok(name) : fail(name, why));

const creds = { email: `g0-${Date.now()}@example.com`, password: 'g0-password-123!' };

let r = await call('POST', '/api/auth/register', { body: creds });
expect(
  'register (public, csrf-exempt)',
  r.status === 201 || r.status === 200,
  `${r.status} ${r.text.slice(0, 200)}`,
);
jar.clear();

r = await call('POST', '/api/auth/login', { body: creds });
expect(
  'login sets session + csrf cookies',
  r.status < 300 && jar.has('icore_sid') && jar.has('icore_csrf'),
  `${r.status} cookies=${[...jar.keys()]} ${r.text.slice(0, 200)}`,
);

r = await call('GET', '/api/auth/session');
expect(
  'GET /api/auth/session resolves the user',
  r.status === 200 && r.json?.user?.email === creds.email,
  `${r.status} ${r.text.slice(0, 200)}`,
);

r = await call('GET', '/api/profile');
expect(
  'GET /api/profile (AuthGuard + profile controller)',
  r.status === 200,
  `${r.status} ${r.text.slice(0, 200)}`,
);

r = await call('POST', '/api/auth/admin/revoke-user/someone');
expect(
  'mutating route without X-CSRF-Token is rejected (csrf_mismatch)',
  r.status === 403 && /csrf_mismatch/.test(r.text),
  `${r.status} ${r.text.slice(0, 200)}`,
);

r = await call('POST', '/api/auth/admin/revoke-user/someone', {
  headers: { 'x-csrf-token': jar.get('icore_csrf') ?? '' },
});
expect(
  'with a valid X-CSRF-Token the CSRF guard passes (ability guard rejects instead)',
  r.status === 403 && !/csrf_mismatch/.test(r.text),
  `${r.status} ${r.text.slice(0, 200)}`,
);

r = await call('POST', '/api/auth/logout');
expect('logout', r.status < 300, `${r.status} ${r.text.slice(0, 200)}`);
const sid = jar.get('icore_sid');
r = await call('GET', '/api/auth/session', { headers: { cookie: `icore_sid=${sid ?? 'gone'}` } });
expect(
  'session is dead after logout (401)',
  r.status === 401,
  `${r.status} ${r.text.slice(0, 200)}`,
);

r = await call('GET', '/g0/presign');
expect(
  'offline S3 presign works on workerd',
  r.status === 200 && r.json?.hasExpires === true,
  `${r.status} ${r.text.slice(0, 200)}`,
);
r = await call('GET', '/g0/supabase');
expect(
  'supabase-js client constructs on workerd',
  r.status === 200 && r.json?.client === true,
  `${r.status} ${r.text.slice(0, 200)}`,
);
r = await call('GET', '/g0/env');
expect(
  'process.env populated from wrangler vars and visible to ConfigService',
  r.status === 200 && r.json?.populated === true,
  `${r.status} ${r.text.slice(0, 200)}`,
);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('slice: all checks ok');
