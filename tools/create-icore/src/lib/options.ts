export type AuthBackend = 'supabase' | 'firebase' | 'mongodb' | 'postgres';
export type AuthProvider = AuthBackend | 'none';
export type DbProvider = 'supabase' | 'firebase' | 'mongodb' | 'postgres' | 'none';
export type UploadProvider = 'supabase' | 'firebase' | 'cloudinary' | 'mongodb' | 'none';
export type PaymentProvider = 'paypal' | 'none';
export type JobsProvider = 'bullmq' | 'none';
export type ExampleMode = 'notes' | 'none';
export type UiLibrary = 'shadcn' | 'antd' | 'mui';
export type MsTransport = 'tcp' | 'redis' | 'nats' | 'mqtt' | 'rmq' | 'kafka';
export type PackageManager = 'yarn' | 'npm' | 'pnpm';

/**
 * Returns the correct invocation for a package.json script.
 * yarn/pnpm: `yarn <script>` / `pnpm <script>`
 * npm:       `npm run <script>` (npm requires the `run` keyword for custom scripts)
 */
export function pmRun(pm: PackageManager, script: string): string {
  return pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;
}

export interface OptionsValidation {
  warnings: string[];
  /** Options with incompatibilities auto-corrected (e.g. example downgraded to none). */
  corrected: CreateIcoreOptions;
}

/**
 * Validates option combinations and returns warnings + a corrected copy.
 * Safe to call from both interactive prompts and non-interactive flag paths.
 */
export function validateOptions(opts: CreateIcoreOptions): OptionsValidation {
  const warnings: string[] = [];
  let corrected = opts;

  if (opts.authProvider === 'none' && opts.example !== 'none') {
    warnings.push(
      'notes example requires auth — example has been set to none (auth=none disables CASL and AuthGuard)',
    );
    corrected = { ...corrected, example: 'none' };
  }

  if (opts.jobs === 'bullmq' && opts.transport !== 'redis') {
    warnings.push(
      `BullMQ requires Redis but transport is "${opts.transport}" — add a Redis service manually or switch transport to "redis"`,
    );
  }

  return { warnings, corrected };
}

export interface CreateIcoreOptions {
  projectName: string;
  targetDir: string;
  authProvider: AuthProvider;
  dbProvider: DbProvider;
  upload: UploadProvider;
  payment: PaymentProvider;
  jobs: JobsProvider;
  example: ExampleMode;
  ui: UiLibrary;
  transport: MsTransport;
  packageManager: PackageManager;
  initGit: boolean;
  install: boolean;
}
