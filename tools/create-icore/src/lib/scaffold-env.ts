import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreateIcoreOptions } from './options.js';

// Broker transport → the FOO_<TOKEN>_* env prefix used in the .env files.
export const TRANSPORT_ENV_TOKEN: Record<string, string> = {
  redis: 'REDIS',
  nats: 'NATS',
  mqtt: 'MQTT',
  rmq: 'RMQ',
  kafka: 'KAFKA',
};

// Broker transport → its NestJS driver dep(s). These are optional peer deps of
// @nestjs/microservices, so a project crashes on boot without them. (ioredis
// for redis already ships via the jobs/BullMQ stack.)
export const TRANSPORT_DEPS: Record<string, Record<string, string>> = {
  nats: { nats: '^2.29.3' },
  mqtt: { mqtt: '^5.15.1' },
  rmq: { amqplib: '^2.0.1', 'amqp-connection-manager': '^5.0.0' },
  kafka: { kafkajs: '^2.2.4' },
};

export const MONGODB_DEPS: Record<string, string> = {
  mongoose: '^9.6.3',
  '@nestjs/mongoose': '^11.0.4',
  bcrypt: '^6.0.0',
  jsonwebtoken: '^9.0.3',
};

/**
 * Uncomments the `# ${PREFIX}_${TOKEN}_*=` lines in a .env for the chosen broker
 * transport (e.g. transport=rmq → uncomment AUTH_RMQ_URL + AUTH_RMQ_QUEUE).
 * tcp has no broker vars, so it's a no-op.
 */
function uncommentTransportEnv(text: string, prefix: string, transport: string): string {
  const token = TRANSPORT_ENV_TOKEN[transport];
  if (!token) return text;
  return text.replace(new RegExp(`^# (${prefix}_${token}_[A-Z0-9_]*=)`, 'gm'), '$1');
}

/**
 * Strips a transport prefix (e.g. `NOTES`, `PAYMENT`) and its comment lines
 * from the gateway .env when the matching microservice is removed, so the
 * gateway doesn't try to build a transport for a MS that isn't there.
 */
export async function stripGatewayTransport(targetDir: string, prefix: string): Promise<void> {
  const gatewayEnv = join(targetDir, 'apps/api/.env');
  try {
    const env = await readFile(gatewayEnv, 'utf8');
    const next = env
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith(`${prefix}_`) &&
          !line.startsWith(`# ${prefix}_`) &&
          !line.includes(`${prefix} MS transport`),
      )
      .join('\n');
    await writeFile(gatewayEnv, next);
  } catch {
    // ignore — .env may not exist in test scaffolds
  }
}

/**
 * A provider's raw marker SDK(s) in the ROOT package.json. Kept in sync with the
 * audit's `PROVIDER_SDKS` (manifest/audit.ts). The shared `@icore/firebase-admin`
 * workspace alias is NOT a raw SDK and is owned by `removeFirebaseAdminLib`, so it
 * is intentionally excluded here.
 */
const ROOT_PROVIDER_SDKS: Record<string, string[]> = {
  supabase: ['@supabase/supabase-js'],
  cloudinary: ['cloudinary'],
  mongodb: ['mongoose'],
  firebase: ['firebase-admin'],
};

/**
 * Prune the raw provider SDK(s) of every provider NOT chosen from the generated
 * ROOT package.json. Uses the SAME chosen-set as the audit gate
 * (`{ authProvider, dbProvider, upload }`). The chosen provider's SDK and all
 * transport driver deps (nats/mqtt/amqplib/kafkajs) are left untouched — this
 * only removes the 4 unchosen marker SDKs. Run AFTER `rewriteRootPackageJson`
 * (which may have ADDED `mongoose`) so a mongodb project keeps it.
 */
export async function pruneRootProviderDeps(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const chosen = new Set<string>([opts.authProvider, opts.dbProvider, opts.upload]);
  const drop = new Set<string>();
  for (const [provider, sdks] of Object.entries(ROOT_PROVIDER_SDKS)) {
    if (!chosen.has(provider)) for (const sdk of sdks) drop.add(sdk);
  }
  if (drop.size === 0) return;
  const pkgPath = join(targetDir, 'package.json');
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const sdk of drop) delete deps[sdk];
    }
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // package.json may be absent in partial fixtures
  }
}

export async function rewriteRootPackageJson(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const pkgPath = join(targetDir, 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  pkg['name'] = opts.projectName;
  pkg['version'] = '0.0.1';
  pkg['private'] = true;
  delete (pkg as { description?: string }).description;
  // Add the chosen broker transport's driver dep(s) (see TRANSPORT_DEPS).
  const transportDeps = TRANSPORT_DEPS[opts.transport];
  if (transportDeps) {
    const deps = (pkg['dependencies'] ??= {}) as Record<string, string>;
    Object.assign(deps, transportDeps);
  }
  // Add MongoDB dependencies if MongoDB is used as a provider for Auth, DB, or Storage.
  if (
    opts.authProvider === 'mongodb' ||
    opts.dbProvider === 'mongodb' ||
    opts.upload === 'mongodb'
  ) {
    const deps = (pkg['dependencies'] ??= {}) as Record<string, string>;
    Object.assign(deps, MONGODB_DEPS);
  }
  // Remove the yarn-specific packageManager field for npm/pnpm so corepack doesn't reject them.
  // For yarn, update it to the current version (corepack uses this to download the runtime).
  if (opts.packageManager !== 'yarn') {
    delete (pkg as { packageManager?: string }).packageManager;
  } else {
    // Read the pinned yarn version from .yarnrc.yml so it stays in sync automatically.
    try {
      const yarnrc = await readFile(join(targetDir, '.yarnrc.yml'), 'utf8');
      const match = yarnrc.match(/^yarnPath:\s*.+yarn-(\d+\.\d+\.\d+)\.cjs/m);
      if (match?.[1]) {
        pkg['packageManager'] = `yarn@${match[1]}`;
      }
    } catch {
      // ignore — keep whatever the template had
    }
  }
  // pnpm 9+ no longer reads the "pnpm" key from package.json — settings now
  // live in pnpm-workspace.yaml. The pnpm-workspace.yaml is written by
  // writePnpmWorkspace(); nothing goes into package.json for pnpm.
  delete (pkg as { pnpm?: unknown }).pnpm;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

export async function writeAuthEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/microservices/auth/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^AUTH_PROVIDER=.*$/m, `AUTH_PROVIDER=${opts.authProvider}`)
    .replace(/^AUTH_TRANSPORT=.*$/m, `AUTH_TRANSPORT=${opts.transport}`);
  next = uncommentTransportEnv(next, 'AUTH', opts.transport);
  if (opts.authProvider === 'mongodb') {
    next +=
      '\nMONGODB_URI=mongodb://localhost:27017/icore-auth\nJWT_SECRET=change-me-in-production\n';
  }
  await writeFile(join(targetDir, 'apps/microservices/auth/.env'), next);
}

export async function writeUploadEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  if (opts.upload === 'none') return;
  const envExample = join(targetDir, 'apps/microservices/upload/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^STORAGE_PROVIDER=.*$/m, `STORAGE_PROVIDER=${opts.upload}`)
    .replace(/^UPLOAD_TRANSPORT=.*$/m, `UPLOAD_TRANSPORT=${opts.transport}`);
  next = uncommentTransportEnv(next, 'UPLOAD', opts.transport);
  if (opts.upload === 'mongodb') {
    next += '\nMONGODB_URI=mongodb://localhost:27017/icore-upload\n';
  }
  await writeFile(join(targetDir, 'apps/microservices/upload/.env'), next);
}

export async function writeNotesEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  if (opts.example === 'none') return;
  const envExample = join(targetDir, 'apps/microservices/notes/.env.example');
  try {
    const env = await readFile(envExample, 'utf8');
    let next = env.replace(/^NOTES_TRANSPORT=.*$/m, `NOTES_TRANSPORT=${opts.transport}`);
    next = uncommentTransportEnv(next, 'NOTES', opts.transport);
    await writeFile(join(targetDir, 'apps/microservices/notes/.env'), next);
  } catch {
    // notes .env.example may not exist in older snapshots
  }
}

export async function writeGatewayEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/api/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^AUTH_TRANSPORT=.*$/m, `AUTH_TRANSPORT=${opts.transport}`)
    .replace(/^UPLOAD_TRANSPORT=.*$/m, `UPLOAD_TRANSPORT=${opts.transport}`)
    .replace(/^NOTES_TRANSPORT=.*$/m, `NOTES_TRANSPORT=${opts.transport}`)
    .replace(/^PAYMENT_TRANSPORT=.*$/m, `PAYMENT_TRANSPORT=${opts.transport}`);
  for (const prefix of ['AUTH', 'UPLOAD', 'NOTES', 'PAYMENT']) {
    next = uncommentTransportEnv(next, prefix, opts.transport);
  }
  await writeFile(join(targetDir, 'apps/api/.env'), next);
}

export async function writeRootEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const lines = [
    `# Database provider used by application data microservices.`,
    `# Independent of AUTH_PROVIDER — mix-and-match supported.`,
    `DB_PROVIDER=${opts.dbProvider}`,
    ``,
  ];
  if (opts.dbProvider === 'mongodb') {
    lines.push(`MONGODB_URI=mongodb://localhost:27017/icore-data`);
    lines.push(``);
  }
  await writeFile(join(targetDir, '.env'), lines.join('\n'));
}

export async function writeClientEnv(targetDir: string): Promise<void> {
  const envExample = join(targetDir, 'apps/client/.env.example');
  try {
    const env = await readFile(envExample, 'utf8');
    await writeFile(join(targetDir, 'apps/client/.env'), env);
  } catch {
    // .env.example may not exist in older snapshots
  }
}

export async function writePaymentEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  if (opts.payment === 'none') return;
  const envExample = join(targetDir, 'apps/microservices/payment/.env.example');
  try {
    const env = await readFile(envExample, 'utf8');
    let next = env
      .replace(/^PAYMENT_PROVIDER=.*$/m, `PAYMENT_PROVIDER=${opts.payment}`)
      .replace(/^PAYMENT_TRANSPORT=.*$/m, `PAYMENT_TRANSPORT=${opts.transport}`);
    next = uncommentTransportEnv(next, 'PAYMENT', opts.transport);
    await writeFile(join(targetDir, 'apps/microservices/payment/.env'), next);
  } catch {
    // payment MS not present in template — older snapshots predate Plan 9
  }
}
