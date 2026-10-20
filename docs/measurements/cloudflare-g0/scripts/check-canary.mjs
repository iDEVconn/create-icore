// Fails unless the built Worker proves implicit constructor injection works.
const base = process.env.G0_URL ?? 'http://localhost:8787';
const res = await fetch(`${base}/g0/canary`).catch((e) => {
  console.error(`canary: cannot reach ${base}: ${e.message}`);
  process.exit(2);
});
const body = await res.json().catch(() => ({}));
if (res.status === 200 && body.implicitInjection === true) {
  console.log('ok: implicit constructor injection works in the built bundle');
} else {
  console.error(`canary FAILED: status ${res.status} body ${JSON.stringify(body)}`);
  process.exit(1);
}
