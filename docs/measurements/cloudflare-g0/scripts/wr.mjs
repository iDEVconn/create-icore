#!/usr/bin/env node
// Runs `wrangler <args>` with the Cloudflare credentials from a "Label: value" file handed to the
// child only, scrubbing every secret, the account id and the workers.dev subdomain from its output.
//   node scripts/wr.mjs --creds <file> [--stdin-random-hex <bytes>] -- <wrangler args…>
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCreds } from './measure.mjs';
import { buildRedactor } from './redact.mjs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const own = argv.slice(0, sep < 0 ? argv.length : sep);
const wranglerArgs = sep < 0 ? [] : argv.slice(sep + 1);
const opt = (name) => (own.includes(name) ? own[own.indexOf(name) + 1] : undefined);

const creds = opt('--creds') ? loadCreds(opt('--creds')) : {};
const redact = buildRedactor({ secrets: [creds.token, creds.accountId] });
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn('npx', ['wrangler', ...wranglerArgs], {
  cwd: root,
  env: {
    ...process.env,
    ...(creds.token ? { CLOUDFLARE_API_TOKEN: creds.token } : {}),
    ...(creds.accountId ? { CLOUDFLARE_ACCOUNT_ID: creds.accountId } : {}),
  },
});
const pipe = (src, dst) => src.on('data', (d) => dst.write(redact(d.toString())));
pipe(child.stdout, process.stdout);
pipe(child.stderr, process.stderr);
if (opt('--stdin-random-hex'))
  child.stdin.end(randomBytes(Number(opt('--stdin-random-hex'))).toString('hex'));
else child.stdin.end();
child.on('close', (code) => process.exit(code ?? 1));
