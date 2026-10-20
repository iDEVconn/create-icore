import { readFile } from 'node:fs/promises';
import type {
  AuthProvider,
  DbProvider,
  UploadProvider,
  PaymentProvider,
  JobsProvider,
  AiProvider,
  ExampleMode,
  UiLibrary,
  MsTransport,
  PackageManager,
  CreateIcoreOptions,
  SessionStoreKind,
  HostKind,
} from './options.js';

export class ConfigFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigFileError';
  }
}

const AUTH_PROVIDERS: readonly AuthProvider[] = [
  'supabase',
  'firebase',
  'mongodb',
  'postgres',
  'none',
];
const DB_PROVIDERS: readonly DbProvider[] = [
  'supabase',
  'firebase',
  'mongodb',
  'postgres',
  'sqlite',
  'd1',
  'none',
];
const UPLOAD_PROVIDERS: readonly UploadProvider[] = [
  'supabase',
  'firebase',
  'cloudinary',
  'minio',
  'r2',
  'mongodb',
  'none',
];
const PAYMENT_PROVIDERS: readonly PaymentProvider[] = ['paypal', 'none'];
const JOBS_PROVIDERS: readonly JobsProvider[] = ['bullmq', 'none'];
const AI_PROVIDERS: readonly AiProvider[] = ['llm-router', 'none'];
const EXAMPLE_MODES: readonly ExampleMode[] = ['notes', 'none'];
const UI_LIBRARIES: readonly UiLibrary[] = ['shadcn', 'antd', 'mui'];
const MS_TRANSPORTS: readonly MsTransport[] = [
  'tcp',
  'redis',
  'nats',
  'mqtt',
  'rmq',
  'kafka',
  'local',
];
const SESSION_STORES: readonly SessionStoreKind[] = ['redis', 'memory', 'durable-object'];
const HOSTS: readonly HostKind[] = ['node', 'cloudflare'];
const PACKAGE_MANAGERS: readonly PackageManager[] = ['yarn', 'npm', 'pnpm'];

function assertEnum<T extends string>(
  field: string,
  value: unknown,
  valid: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !valid.includes(value as T)) {
    throw new ConfigFileError(
      `${label} "${field}" got "${String(value)}", expected one of: ${valid.join(', ')}`,
    );
  }
  return value as T;
}

function assertBoolean(field: string, value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ConfigFileError(`${label} "${field}" must be a boolean, got ${typeof value}`);
  }
  return value;
}

export function validateConfig(raw: unknown, label = 'config field'): Partial<CreateIcoreOptions> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigFileError('config file must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const result: Partial<CreateIcoreOptions> = {};

  if ('projectName' in obj) {
    const v = obj['projectName'];
    if (typeof v !== 'string' || !/^[a-z0-9-]+$/i.test(v)) {
      throw new ConfigFileError(
        `${label} "projectName" must match /^[a-z0-9-]+$/i, got "${String(v)}"`,
      );
    }
    result.projectName = v;
  }
  if ('host' in obj) result.host = assertEnum('host', obj['host'], HOSTS, label);
  if ('authProvider' in obj)
    result.authProvider = assertEnum('authProvider', obj['authProvider'], AUTH_PROVIDERS, label);
  if ('dbProvider' in obj)
    result.dbProvider = assertEnum('dbProvider', obj['dbProvider'], DB_PROVIDERS, label);
  if ('upload' in obj) result.upload = assertEnum('upload', obj['upload'], UPLOAD_PROVIDERS, label);
  if ('payment' in obj)
    result.payment = assertEnum('payment', obj['payment'], PAYMENT_PROVIDERS, label);
  if ('jobs' in obj) result.jobs = assertEnum('jobs', obj['jobs'], JOBS_PROVIDERS, label);
  if ('ai' in obj) result.ai = assertEnum('ai', obj['ai'], AI_PROVIDERS, label);
  if ('example' in obj)
    result.example = assertEnum('example', obj['example'], EXAMPLE_MODES, label);
  if ('ui' in obj) result.ui = assertEnum('ui', obj['ui'], UI_LIBRARIES, label);
  if ('transport' in obj)
    result.transport = assertEnum('transport', obj['transport'], MS_TRANSPORTS, label);
  if ('session' in obj)
    result.session = assertEnum('session', obj['session'], SESSION_STORES, label);
  if ('packageManager' in obj)
    result.packageManager = assertEnum(
      'packageManager',
      obj['packageManager'],
      PACKAGE_MANAGERS,
      label,
    );
  if ('initGit' in obj) result.initGit = assertBoolean('initGit', obj['initGit'], label);
  if ('install' in obj) result.install = assertBoolean('install', obj['install'], label);
  // targetDir is always derived from projectName + cwd — ignored if present

  return result;
}

export async function loadConfig(filePath: string): Promise<Partial<CreateIcoreOptions>> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    throw new ConfigFileError(`config file not found: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ConfigFileError(
      `config file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return validateConfig(parsed);
}
