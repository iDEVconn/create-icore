import { readFile } from 'node:fs/promises';
import type {
  AuthProvider,
  DbProvider,
  UploadProvider,
  PaymentProvider,
  JobsProvider,
  ExampleMode,
  UiLibrary,
  MsTransport,
  PackageManager,
  CreateIcoreOptions,
} from './options.js';

export class ConfigFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigFileError';
  }
}

const AUTH_PROVIDERS: readonly AuthProvider[] = ['supabase', 'firebase', 'mongodb', 'none'];
const DB_PROVIDERS: readonly DbProvider[] = ['supabase', 'firebase', 'mongodb', 'none'];
const UPLOAD_PROVIDERS: readonly UploadProvider[] = [
  'supabase',
  'firebase',
  'cloudinary',
  'mongodb',
  'none',
];
const PAYMENT_PROVIDERS: readonly PaymentProvider[] = ['paypal', 'none'];
const JOBS_PROVIDERS: readonly JobsProvider[] = ['bullmq', 'none'];
const EXAMPLE_MODES: readonly ExampleMode[] = ['notes', 'none'];
const UI_LIBRARIES: readonly UiLibrary[] = ['shadcn', 'antd', 'mui'];
const MS_TRANSPORTS: readonly MsTransport[] = ['tcp', 'redis', 'nats', 'mqtt', 'rmq', 'kafka'];
const PACKAGE_MANAGERS: readonly PackageManager[] = ['yarn', 'npm', 'pnpm'];

function assertEnum<T extends string>(field: string, value: unknown, valid: readonly T[]): T {
  if (typeof value !== 'string' || !valid.includes(value as T)) {
    throw new ConfigFileError(
      `config field "${field}" got "${String(value)}", expected one of: ${valid.join(', ')}`,
    );
  }
  return value as T;
}

function assertBoolean(field: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ConfigFileError(`config field "${field}" must be a boolean, got ${typeof value}`);
  }
  return value;
}

export function validateConfig(raw: unknown): Partial<CreateIcoreOptions> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigFileError('config file must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const result: Partial<CreateIcoreOptions> = {};

  if ('projectName' in obj) {
    const v = obj['projectName'];
    if (typeof v !== 'string' || !/^[a-z0-9-]+$/i.test(v)) {
      throw new ConfigFileError(
        `config field "projectName" must match /^[a-z0-9-]+$/i, got "${String(v)}"`,
      );
    }
    result.projectName = v;
  }
  if ('authProvider' in obj)
    result.authProvider = assertEnum('authProvider', obj['authProvider'], AUTH_PROVIDERS);
  if ('dbProvider' in obj)
    result.dbProvider = assertEnum('dbProvider', obj['dbProvider'], DB_PROVIDERS);
  if ('upload' in obj) result.upload = assertEnum('upload', obj['upload'], UPLOAD_PROVIDERS);
  if ('payment' in obj) result.payment = assertEnum('payment', obj['payment'], PAYMENT_PROVIDERS);
  if ('jobs' in obj) result.jobs = assertEnum('jobs', obj['jobs'], JOBS_PROVIDERS);
  if ('example' in obj) result.example = assertEnum('example', obj['example'], EXAMPLE_MODES);
  if ('ui' in obj) result.ui = assertEnum('ui', obj['ui'], UI_LIBRARIES);
  if ('transport' in obj)
    result.transport = assertEnum('transport', obj['transport'], MS_TRANSPORTS);
  if ('packageManager' in obj)
    result.packageManager = assertEnum('packageManager', obj['packageManager'], PACKAGE_MANAGERS);
  if ('initGit' in obj) result.initGit = assertBoolean('initGit', obj['initGit']);
  if ('install' in obj) result.install = assertBoolean('install', obj['install']);
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
