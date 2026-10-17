import { readJson, type Tree } from '@nx/devkit';
import type { MicroserviceTransport } from '../schema';

const VALID_TRANSPORTS = new Set<MicroserviceTransport>([
  'tcp',
  'redis',
  'nats',
  'mqtt',
  'rmq',
  'kafka',
]);

const TRANSPORT_ENV_TOKEN: Record<string, string> = {
  redis: 'REDIS',
  nats: 'NATS',
  mqtt: 'MQTT',
  rmq: 'RMQ',
  kafka: 'KAFKA',
};

export interface DbProviderInfo {
  providerName: 'supabase' | 'postgres' | 'mongodb' | 'firebase' | 'sqlite';
  importPath: string;
  moduleSymbol: string;
  extraDeps: Record<string, string>;
}

const DB_PROVIDER_MAP: Record<DbProviderInfo['providerName'], DbProviderInfo> = {
  supabase: {
    providerName: 'supabase',
    importPath: '@icore/db-supabase',
    moduleSymbol: 'SupabaseDbModule',
    extraDeps: {
      '@icore/db-supabase': '*',
      '@supabase/supabase-js': '^2.117.2',
    },
  },
  postgres: {
    providerName: 'postgres',
    importPath: '@icore/db-postgres',
    moduleSymbol: 'PostgresDbModule',
    extraDeps: {
      '@icore/db-postgres': '*',
    },
  },
  mongodb: {
    providerName: 'mongodb',
    importPath: '@icore/db-mongodb',
    moduleSymbol: 'MongoDbDbModule',
    extraDeps: {
      '@icore/db-mongodb': '*',
    },
  },
  firebase: {
    providerName: 'firebase',
    importPath: '@icore/db-firestore',
    moduleSymbol: 'FirestoreDbModule',
    extraDeps: {
      '@icore/db-firestore': '*',
      '@icore/firebase-admin': '*',
    },
  },
  sqlite: {
    providerName: 'sqlite',
    importPath: '@icore/db-sqlite',
    moduleSymbol: 'SqliteDbModule',
    extraDeps: {
      '@icore/db-sqlite': '*',
    },
  },
};

/**
 * Scans `apps/microservices/*` and `apps/api/.env.example` for existing TCP ports
 * (in the 4000-4999 range) and returns `maxPort + 1` (minimum 4006).
 */
export function detectNextTcpPort(tree: Tree): number {
  let maxPort = 4005;
  const portRegex = /^[A-Z0-9_]+_PORT=(\d+)/gm;

  const filesToScan: string[] = ['apps/api/.env.example', 'apps/api/.env'];
  if (tree.exists('apps/microservices')) {
    for (const child of tree.children('apps/microservices')) {
      filesToScan.push(`apps/microservices/${child}/.env.example`);
      filesToScan.push(`apps/microservices/${child}/.env`);
    }
  }

  for (const filePath of filesToScan) {
    if (!tree.exists(filePath)) continue;
    const text = tree.read(filePath, 'utf-8') ?? '';
    for (const match of text.matchAll(portRegex)) {
      const p = Number(match[1]);
      if (Number.isInteger(p) && p >= 4000 && p < 5000 && p > maxPort) {
        maxPort = p;
      }
    }
  }

  return maxPort + 1;
}

/**
 * Scans `apps/microservices/<name>/project.json` for `targets.serve.options.port`
 * and returns `maxInspectPort + 1` (minimum 9235).
 */
export function detectNextInspectPort(tree: Tree): number {
  let maxInspectPort = 9234;
  if (!tree.exists('apps/microservices')) return maxInspectPort + 1;

  for (const child of tree.children('apps/microservices')) {
    const projPath = `apps/microservices/${child}/project.json`;
    if (!tree.exists(projPath)) continue;
    try {
      const proj = readJson<{
        targets?: { serve?: { options?: { port?: number } } };
      }>(tree, projPath);
      const p = proj.targets?.serve?.options?.port;
      if (typeof p === 'number' && Number.isInteger(p) && p >= 9200 && p < 9400) {
        if (p > maxInspectPort) maxInspectPort = p;
      }
    } catch {
      // ignore malformed project.json
    }
  }

  return maxInspectPort + 1;
}

/**
 * Detects the active microservice transport from `apps/api/.env` or `apps/api/.env.example`.
 */
export function detectWorkspaceTransport(tree: Tree): MicroserviceTransport {
  for (const envPath of ['apps/api/.env', 'apps/api/.env.example']) {
    if (!tree.exists(envPath)) continue;
    const text = tree.read(envPath, 'utf-8') ?? '';
    const match = text.match(/^[A-Z0-9_]+_TRANSPORT=([a-z]+)/m);
    const candidate = match?.[1]?.toLowerCase() as MicroserviceTransport | undefined;
    if (candidate && VALID_TRANSPORTS.has(candidate)) {
      return candidate;
    }
  }
  return 'tcp';
}

/**
 * Detects the workspace's active DB provider for `--withDb`.
 */
export function detectDbProvider(tree: Tree): DbProviderInfo {
  if (tree.exists('.env')) {
    const rootEnv = tree.read('.env', 'utf-8') ?? '';
    const match = rootEnv.match(/^DB_PROVIDER=([a-z]+)/m);
    const key = match?.[1] as DbProviderInfo['providerName'] | undefined;
    if (key && key in DB_PROVIDER_MAP) {
      return DB_PROVIDER_MAP[key];
    }
  }

  const strategyDirs: Array<{ dir: string; key: DbProviderInfo['providerName'] }> = [
    { dir: 'libs/db-strategies/supabase', key: 'supabase' },
    { dir: 'libs/db-strategies/postgres', key: 'postgres' },
    { dir: 'libs/db-strategies/mongodb', key: 'mongodb' },
    { dir: 'libs/db-strategies/firestore', key: 'firebase' },
    { dir: 'libs/db-strategies/sqlite', key: 'sqlite' },
  ];
  for (const item of strategyDirs) {
    if (tree.exists(item.dir)) {
      return DB_PROVIDER_MAP[item.key];
    }
  }

  return DB_PROVIDER_MAP.supabase;
}

/**
 * Uncomments `# <PREFIX>_<TOKEN>_*=` lines when a non-TCP broker transport is selected.
 */
export function uncommentBrokerEnvLines(
  text: string,
  prefix: string,
  transport: MicroserviceTransport,
): string {
  const token = TRANSPORT_ENV_TOKEN[transport];
  if (!token) return text;
  return text.replace(new RegExp(`^# (${prefix}_${token}_[A-Z0-9_]*=)`, 'gm'), '$1');
}

/**
 * Appends the transport configuration block for the new microservice to
 * `apps/api/.env.example` and `apps/api/.env` (if present).
 */
export function appendGatewayEnvBlock(
  tree: Tree,
  opts: {
    fileName: string;
    className: string;
    constantName: string;
    transport: MicroserviceTransport;
    port: number;
  },
): void {
  const rawBlock = [
    ``,
    `# ${opts.className} MS transport — must match apps/microservices/${opts.fileName}/.env`,
    `${opts.constantName}_TRANSPORT=${opts.transport}`,
    `${opts.constantName}_HOST=127.0.0.1`,
    `${opts.constantName}_PORT=${opts.port}`,
    `# ${opts.constantName}_REDIS_URL=redis://localhost:6379`,
    `# ${opts.constantName}_NATS_URL=nats://localhost:4222`,
    `# ${opts.constantName}_MQTT_URL=mqtt://localhost:1883`,
    `# ${opts.constantName}_RMQ_URL=amqp://localhost:5672`,
    `# ${opts.constantName}_RMQ_QUEUE=${opts.fileName.replace(/-/g, '_')}_queue`,
    `# ${opts.constantName}_KAFKA_BROKERS=localhost:9092`,
    `# ${opts.constantName}_KAFKA_CLIENT_ID=${opts.fileName}`,
    ``,
  ].join('\n');

  const block = uncommentBrokerEnvLines(rawBlock, opts.constantName, opts.transport);

  for (const envPath of ['apps/api/.env.example', 'apps/api/.env']) {
    if (!tree.exists(envPath)) continue;
    const current = tree.read(envPath, 'utf-8') ?? '';
    if (current.includes(`${opts.constantName}_TRANSPORT=`)) continue;
    const trimmed = current.trimEnd();
    tree.write(envPath, `${trimmed}\n${block}`);
  }
}
