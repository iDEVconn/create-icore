// Functional check of the Durable Object and D1 probes (numbers are only meaningful when deployed).
const base = process.env.G0_URL ?? 'http://localhost:8787';
let failed = 0;
const expect = (name, cond, why) => {
  if (cond) console.log(`ok   ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}: ${why}`);
  }
};
const get = async (path) => {
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(60_000) }).catch(
    () => undefined,
  );
  const text = res ? await res.text() : 'unreachable';
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res?.status ?? 0, json, text };
};

const id = `probe-${Date.now()}`;
const a = await get(`/g0/do?id=${id}`);
const b = await get(`/g0/do?id=${id}`);
expect(
  'durable object counter starts at 1',
  a.status === 200 && a.json?.n === 1,
  `${a.status} ${a.text.slice(0, 160)}`,
);
expect(
  'durable object keeps state (counter is 2)',
  b.status === 200 && b.json?.n === 2,
  `${b.status} ${b.text.slice(0, 160)}`,
);
expect(
  'durable object reports a numeric round trip',
  typeof a.json?.doMs === 'number',
  a.text.slice(0, 160),
);
const other = await get(`/g0/do?id=${id}-other`);
expect(
  'a different id is a different object (counter is 1)',
  other.json?.n === 1,
  other.text.slice(0, 160),
);

const d1 = await get('/g0/d1');
expect(
  'd1 probe works (or is cleanly skipped when no binding)',
  d1.status === 200 && (d1.json?.ok === true || d1.json?.skipped === true),
  `${d1.status} ${d1.text.slice(0, 160)}`,
);
if (d1.json?.ok)
  expect(
    'd1 reports a numeric round trip',
    typeof d1.json?.d1Ms === 'number',
    d1.text.slice(0, 160),
  );

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('probes: all checks ok');
