import * as p from '@clack/prompts';
import { resolve } from 'node:path';
import type { AuthProvider, DbProvider, UploadProvider, CreateIcoreOptions } from './options.js';

export interface PromptInput {
  argv: string[];
  cwd: string;
}

export function parseFlags(argv: string[]): Partial<CreateIcoreOptions> & { projectName?: string } {
  const out: Partial<CreateIcoreOptions> & { projectName?: string } = {};
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
      case 'ui':
        out.ui = v as 'shadcn' | 'antd' | 'mui';
        break;
      case 'transport':
        out.transport = v as 'tcp' | 'redis' | 'nats';
        break;
      case 'no-git':
        out.initGit = false;
        break;
      case 'no-install':
        out.install = false;
        break;
    }
  }
  return out;
}

export async function collectOptions({ argv, cwd }: PromptInput): Promise<CreateIcoreOptions> {
  const flags = parseFlags(argv);

  p.intro('icore — bootstrap a new project');

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
      ],
    })) as AuthProvider);
  if (p.isCancel(authProvider)) throw new Error('cancelled');

  const dbProvider =
    flags.dbProvider ??
    ((await p.select({
      message: 'Database backend',
      options: [
        { value: 'supabase', label: 'Supabase Postgres' },
        { value: 'firebase', label: 'Firestore' },
      ],
      initialValue: authProvider as DbProvider,
    })) as DbProvider);
  if (p.isCancel(dbProvider)) throw new Error('cancelled');

  if (dbProvider !== authProvider) {
    p.log.info(
      'Note: in v0.1.0 the DB choice mirrors auth; independent db swap arrives in Plan 8.',
    );
  }

  const upload =
    flags.upload ??
    ((await p.select({
      message: 'File upload provider',
      options: [
        { value: 'supabase', label: 'Supabase Storage' },
        { value: 'firebase', label: 'Firebase Cloud Storage' },
        { value: 'cloudinary', label: 'Cloudinary' },
        { value: 'none', label: 'None — skip the upload microservice' },
      ],
    })) as UploadProvider);
  if (p.isCancel(upload)) throw new Error('cancelled');

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

  const transport =
    flags.transport ??
    ((await p.select({
      message: 'Microservice transport',
      options: [
        { value: 'tcp' as 'tcp' | 'redis' | 'nats', label: 'TCP (default, no broker required)' },
        { value: 'redis' as 'tcp' | 'redis' | 'nats', label: 'Redis' },
        { value: 'nats' as 'tcp' | 'redis' | 'nats', label: 'NATS' },
      ],
      initialValue: 'tcp' as 'tcp' | 'redis' | 'nats',
    })) as 'tcp' | 'redis' | 'nats');
  if (p.isCancel(transport)) throw new Error('cancelled');

  const initGit =
    flags.initGit ??
    !(await p.confirm({ message: 'Initialise git repo?', initialValue: true })) === false;
  const install =
    flags.install ??
    !(await p.confirm({ message: 'Run yarn install?', initialValue: true })) === false;

  return {
    projectName,
    targetDir: resolve(cwd, projectName),
    authProvider,
    dbProvider,
    upload,
    ui,
    transport,
    initGit,
    install,
  };
}
