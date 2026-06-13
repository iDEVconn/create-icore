import * as p from '@clack/prompts';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import type {
  AuthProvider,
  DbProvider,
  UploadProvider,
  PaymentProvider,
  JobsProvider,
  ExampleMode,
  PackageManager,
  MsTransport,
  CreateIcoreOptions,
} from './options.js';

function detectPackageManager(): PackageManager {
  const ua = process.env['npm_config_user_agent'] ?? '';
  if (ua.startsWith('yarn/')) return 'yarn';
  if (ua.startsWith('pnpm/')) return 'pnpm';
  if (ua.startsWith('npm/')) return 'npm';
  return 'yarn';
}

async function readSelfVersion(): Promise<string | null> {
  try {
    // dist/cli.js → ../package.json (after tsup bundle)
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgRaw = await readFile(join(here, '..', 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

async function fetchLatestVersion(timeoutMs = 1500): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(
      'https://registry.npmjs.org/-/package/@idevconn/create-icore/dist-tags',
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { latest?: string };
    return data.latest ?? null;
  } catch {
    return null;
  }
}

export interface PromptInput {
  argv: string[];
  cwd: string;
}

export type ParsedFlags = Partial<CreateIcoreOptions> & {
  projectName?: string;
  _configPath?: string;
};

export function parseFlags(argv: string[]): ParsedFlags {
  const out: ParsedFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith('--')) {
      if (a && !out.projectName) out.projectName = a;
      continue;
    }
    const parts = a.includes('=') ? a.split('=', 2) : [a, argv[++i]];
    const k = parts[0] ?? '';
    const vIn = parts[1];
    const key = k.slice(2);
    const v = (vIn ?? '') as string;
    switch (key) {
      case 'auth':
        out.authProvider = v as AuthProvider;
        break;
      case 'db':
        out.dbProvider = v as DbProvider;
        break;
      case 'upload':
        out.upload = v as UploadProvider;
        break;
      case 'storage':
        process.stderr.write('Warning: --storage is deprecated, use --upload\n');
        out.upload = v as UploadProvider;
        break;
      case 'payment':
        out.payment = v as PaymentProvider;
        break;
      case 'jobs':
        out.jobs = v as JobsProvider;
        break;
      case 'example':
        out.example = v as ExampleMode;
        break;
      case 'ui':
        out.ui = v as 'shadcn' | 'antd' | 'mui';
        break;
      case 'transport':
        out.transport = v as MsTransport;
        break;
      case 'package-manager':
        out.packageManager = v as PackageManager;
        break;
      case 'no-git':
        out.initGit = false;
        break;
      case 'no-install':
        out.install = false;
        break;
      case 'config':
        out._configPath = v;
        break;
    }
  }
  return out;
}

export async function collectOptions({ argv, cwd }: PromptInput): Promise<CreateIcoreOptions> {
  const flags = parseFlags(argv);
  const configPath = flags._configPath;
  delete flags._configPath;

  if (configPath) {
    const configValues = await loadConfig(configPath);
    // Spread order: config values first, CLI flags win on top
    Object.assign(flags, { ...configValues, ...flags });
  }

  const [selfVersion, latestVersion] = await Promise.all([readSelfVersion(), fetchLatestVersion()]);

  const versionTag = selfVersion ? ` v${selfVersion}` : '';
  p.intro(`iCore${versionTag} — bootstrap a new project`);

  if (selfVersion && latestVersion && selfVersion !== latestVersion) {
    p.note(
      `You are running v${selfVersion} but v${latestVersion} is on npm.\n` +
        `Re-run with @latest to refresh:\n` +
        `  npm init @idevconn/icore@latest <name> -- …`,
      'Newer version available',
    );
  }

  const projectName =
    flags.projectName ??
    ((await p.text({
      message: 'Project name',
      placeholder: 'my-app',
      validate: (v) => (v && /^[a-z0-9-]+$/i.test(v) ? undefined : 'Use letters, digits, hyphens'),
    })) as string);
  if (p.isCancel(projectName)) throw new Error('cancelled');

  const authProvider =
    flags.authProvider ??
    ((await p.select({
      message: 'Auth provider',
      options: [
        { value: 'supabase', label: 'Supabase' },
        { value: 'firebase', label: 'Firebase' },
        { value: 'mongodb', label: 'MongoDB (Custom Auth)' },
        { value: 'none', label: 'None — no login, open API (simple SPA)' },
      ],
    })) as AuthProvider);
  if (p.isCancel(authProvider)) throw new Error('cancelled');

  const dbProvider: DbProvider =
    authProvider === 'none'
      ? 'none'
      : (flags.dbProvider ??
        ((await p.select({
          message: 'Database backend',
          options: [
            { value: 'supabase', label: 'Supabase Postgres' },
            { value: 'firebase', label: 'Firestore' },
            { value: 'mongodb', label: 'MongoDB' },
          ],
          initialValue: authProvider as DbProvider,
        })) as DbProvider));
  if (p.isCancel(dbProvider)) throw new Error('cancelled');

  const upload =
    flags.upload ??
    ((await p.select({
      message: 'File upload provider',
      options: [
        { value: 'supabase', label: 'Supabase Storage' },
        { value: 'firebase', label: 'Firebase Cloud Storage' },
        { value: 'cloudinary', label: 'Cloudinary' },
        { value: 'mongodb', label: 'MongoDB GridFS' },
        { value: 'none', label: 'None — skip the upload microservice' },
      ],
    })) as UploadProvider);
  if (p.isCancel(upload)) throw new Error('cancelled');

  const payment =
    flags.payment ??
    ((await p.select({
      message: 'Payment provider',
      options: [
        { value: 'none', label: 'None — skip the payment microservice' },
        { value: 'paypal', label: 'PayPal (via @idevconn/payment)' },
      ],
      initialValue: 'none' as PaymentProvider,
    })) as PaymentProvider);
  if (p.isCancel(payment)) throw new Error('cancelled');

  const jobs =
    flags.jobs ??
    ((await p.select({
      message: 'Job queue (BullMQ + bull-board)',
      options: [
        { value: 'none', label: 'None — skip jobs MS' },
        { value: 'bullmq', label: 'BullMQ + bull-board admin UI (requires Redis)' },
      ],
      initialValue: 'none' as JobsProvider,
    })) as JobsProvider);
  if (p.isCancel(jobs)) throw new Error('cancelled');

  const example: ExampleMode =
    authProvider === 'none'
      ? 'none'
      : (flags.example ??
        ((await p.select({
          message: 'Include notes sample feature? (CRUD demo — remove before production)',
          options: [
            { value: 'notes' as ExampleMode, label: 'Yes — include notes sample' },
            { value: 'none' as ExampleMode, label: 'No — skip notes (clean slate)' },
          ],
          initialValue: 'notes' as ExampleMode,
        })) as ExampleMode));
  if (p.isCancel(example)) throw new Error('cancelled');

  const ui =
    flags.ui ??
    ((await p.select({
      message: 'UI library',
      options: [
        { value: 'shadcn' as 'shadcn' | 'antd' | 'mui', label: 'shadcn/ui + Tailwind' },
        {
          value: 'antd' as 'shadcn' | 'antd' | 'mui',
          label: 'Ant Design 6',
        },
        {
          value: 'mui' as 'shadcn' | 'antd' | 'mui',
          label: 'MUI 6 (Material Design)',
        },
      ],
      initialValue: 'shadcn' as 'shadcn' | 'antd' | 'mui',
    })) as 'shadcn' | 'antd' | 'mui');
  if (p.isCancel(ui)) throw new Error('cancelled');

  const noMicroservices = authProvider === 'none' && upload === 'none' && payment === 'none';
  const transport: MsTransport =
    flags.transport ??
    (noMicroservices
      ? 'tcp'
      : ((await p.select({
          message: 'Microservice transport',
          options: [
            { value: 'tcp' as MsTransport, label: 'TCP (default, no broker required)' },
            { value: 'redis' as MsTransport, label: 'Redis' },
            { value: 'nats' as MsTransport, label: 'NATS' },
            { value: 'mqtt' as MsTransport, label: 'MQTT' },
            { value: 'rmq' as MsTransport, label: 'RabbitMQ' },
            { value: 'kafka' as MsTransport, label: 'Kafka' },
          ],
          initialValue: 'tcp' as MsTransport,
        })) as MsTransport));
  if (p.isCancel(transport)) throw new Error('cancelled');

  const packageManager = flags.packageManager ?? detectPackageManager();

  if (packageManager === 'yarn') {
    p.note(
      'yarn 4.15+ enforces a 24h publish-age gate (npmMinimalAgeGate=1d), so a\n' +
        '`yarn create @idevconn/icore@latest` run within 24h of a release resolves an\n' +
        'older version. If the banner above shows an unexpectedly old version, either:\n' +
        '  • wait — the version auto-unlocks 24h after publish, or\n' +
        '  • bypass once:  yarn config set npmMinimalAgeGate 0  (then re-run), or\n' +
        '  • use npm/pnpm: npm init @idevconn/icore@latest <name> -- [flags]',
      '⚠ yarn 24h age-gate',
    );
  }

  const initGit =
    flags.initGit ??
    !(await p.confirm({ message: 'Initialise git repo?', initialValue: true })) === false;
  const install =
    flags.install ??
    !(await p.confirm({
      message: `Run ${packageManager} install?`,
      initialValue: true,
    })) === false;

  return {
    projectName,
    targetDir: resolve(cwd, projectName),
    authProvider,
    dbProvider,
    upload,
    payment,
    jobs,
    example,
    ui,
    transport,
    packageManager,
    initGit,
    install,
  };
}
