import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRedactor } from './redact.mjs';
import { percentile, renderTable, summarize, THRESHOLDS } from './measure.mjs';

test('redact removes the token, the account id and the workers.dev account subdomain', () => {
  const redact = buildRedactor({
    secrets: ['cfut_SECRET_TOKEN_123', '0123456789abcdef0123456789abcdef'],
  });
  const out = redact(
    'Authorization: Bearer cfut_SECRET_TOKEN_123 acct 0123456789abcdef0123456789abcdef https://icore-g0.vladimir-sub.workers.dev/g0/health',
  );
  assert.ok(!out.includes('cfut_SECRET_TOKEN_123'));
  assert.ok(!out.includes('0123456789abcdef0123456789abcdef'));
  assert.ok(!out.includes('vladimir-sub'));
  assert.ok(out.includes('<account-subdomain>.workers.dev'));
});

test('redact ignores empty secrets instead of blanking the whole string', () => {
  const redact = buildRedactor({ secrets: ['', undefined, 'abc'] });
  assert.equal(redact('xyz abc xyz'), 'xyz <redacted> xyz');
});

test('percentile uses nearest rank on a sorted copy and does not mutate the input', () => {
  const values = Array.from({ length: 100 }, (_, i) => 100 - i); // 100..1, unsorted
  assert.equal(percentile(values, 50), 50);
  assert.equal(percentile(values, 95), 95);
  assert.equal(percentile(values, 99), 99);
  assert.equal(values[0], 100);
});

test('summarize returns n, min, p50, p95, p99 and max', () => {
  const s = summarize([4, 1, 3, 2, 5]);
  assert.deepEqual(s, { n: 5, min: 1, p50: 3, p95: 5, p99: 5, max: 5 });
});

test('renderTable marks a value above its maximum threshold as FAIL and at-or-below as PASS', () => {
  const md = renderTable([
    { name: 'Worker Startup Time', value: 250, unit: 'ms', max: THRESHOLDS.startupMs },
    { name: 'Slowest cold first request', value: 2600, unit: 'ms', max: THRESHOLDS.coldMaxMs },
    { name: 'Exactly at threshold', value: 30, unit: 'ms', max: 30 },
    { name: 'Not measured', value: undefined, unit: 'ms', max: 10 },
  ]);
  const lines = md.split('\n');
  assert.match(
    lines.find((l) => l.includes('Worker Startup Time')),
    /PASS/,
  );
  assert.match(
    lines.find((l) => l.includes('Slowest cold first request')),
    /FAIL/,
  );
  assert.match(
    lines.find((l) => l.includes('Exactly at threshold')),
    /PASS/,
  );
  assert.match(
    lines.find((l) => l.includes('Not measured')),
    /NOT MEASURED/,
  );
});

test('extractJsonObjects finds pretty-printed objects, keeps a partial tail, ignores braces inside strings', async () => {
  const { extractJsonObjects } = await import('./measure.mjs');
  const a = JSON.stringify(
    { cpuTime: 3, url: 'https://x/?a={b}', note: 'quote " and \\ slash' },
    null,
    4,
  );
  const b = JSON.stringify({ cpuTime: 5 }, null, 4);
  const first = extractJsonObjects(`noise\n${a}\n${b.slice(0, 10)}`);
  assert.equal(first.objects.length, 1);
  assert.equal(first.objects[0].cpuTime, 3);
  assert.equal(first.objects[0].url, 'https://x/?a={b}');
  const second = extractJsonObjects(first.rest + b.slice(10));
  assert.equal(second.objects.length, 1);
  assert.equal(second.objects[0].cpuTime, 5);
  assert.equal(second.rest.trim(), '');
});

test('tally counts statuses and reports the share of 200s', async () => {
  const { tally } = await import('./measure.mjs');
  assert.deepEqual(tally([200, 200, 401, 200, 500]), {
    total: 5,
    ok: 3,
    okRate: 0.6,
    byStatus: { 200: 3, 401: 1, 500: 1 },
  });
  assert.deepEqual(tally([]), { total: 0, ok: 0, okRate: 0, byStatus: {} });
});

test('findTailEvent matches the exact path and query, not a prefix of it', async () => {
  const { findTailEvent } = await import('./measure.mjs');
  const ev = (url) => ({ event: { request: { url } }, cpuTime: 1 });
  const events = [
    ev('https://w.example/api/profile?w=10'),
    ev('https://w.example/api/profile?w=100'),
  ];
  assert.equal(findTailEvent(events, '/api/profile?w=1'), undefined);
  assert.equal(findTailEvent(events, '/api/profile?w=10'), events[0]);
  assert.equal(findTailEvent(events, '/api/profile?w=100'), events[1]);
});

test('checkCanary accepts only { implicitInjection: true }', async () => {
  const { checkCanary } = await import('./measure.mjs');
  assert.doesNotThrow(() => checkCanary(200, '{"implicitInjection":true}'));
  assert.throws(() => checkCanary(200, '{"implicitInjection":false}'), /canary/i);
  assert.throws(() => checkCanary(500, '{}'), /canary/i);
  assert.throws(() => checkCanary(200, 'not json'), /canary/i);
});

test('isFreshRun requires the health response to report the deployed run number', async () => {
  const { isFreshRun } = await import('./measure.mjs');
  assert.equal(isFreshRun('{"ok":true,"run":"3"}', 3), true);
  assert.equal(isFreshRun('{"ok":true,"run":"2"}', 3), false);
  assert.equal(isFreshRun('{"ok":true,"run":null}', 3), false);
  assert.equal(isFreshRun('not json', 3), false);
});

test('redactorFromArgv scrubs the token and account id read from the --creds file', async () => {
  const { redactorFromArgv } = await import('./measure.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'g0-creds-'));
  const file = join(dir, 'creds');
  writeFileSync(
    file,
    'Workers token: tok_SECRET_VALUE\nAccount ID: 0123456789abcdef0123456789abcdef\n',
  );
  const redact = redactorFromArgv(['--url', 'https://x', '--creds', file]);
  const out = redact(
    'failed: tok_SECRET_VALUE at 0123456789abcdef0123456789abcdef via w.sub.workers.dev',
  );
  assert.ok(!out.includes('tok_SECRET_VALUE') && !out.includes('0123456789abcdef0123456789abcdef'));
  assert.ok(out.includes('<account-subdomain>'));
  assert.equal(typeof redactorFromArgv([])('plain'), 'string');
});
