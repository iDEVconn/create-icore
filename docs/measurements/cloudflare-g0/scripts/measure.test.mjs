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
