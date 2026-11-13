export type AuthBackend = 'supabase' | 'firebase' | 'mongodb' | 'postgres';
export type AuthProvider = AuthBackend | 'none';
export type DbProvider =
  'supabase' | 'firebase' | 'mongodb' | 'postgres' | 'sqlite' | 'd1' | 'none';
export type UploadProvider =
  'supabase' | 'firebase' | 'cloudinary' | 'minio' | 'r2' | 'mongodb' | 'none';
export type PaymentProvider = 'paypal' | 'none';
export type JobsProvider = 'bullmq' | 'none';
export type AiProvider = 'llm-router' | 'none';
export type ExampleMode = 'notes' | 'none';
/** `none` = API-only project: no React client is generated. */
export type UiLibrary = 'shadcn' | 'antd' | 'mui' | 'none';
export type HostKind = 'node' | 'cloudflare';
/** `local` is in-process and only exists on the Cloudflare Workers host. */
export type MsTransport = 'tcp' | 'redis' | 'nats' | 'mqtt' | 'rmq' | 'kafka' | 'local';
/** `durable-object` is only available on the Cloudflare Workers host. */
export type SessionStoreKind = 'redis' | 'memory' | 'durable-object';
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
  /** Combinations that cannot be generated at all (the caller must stop). */
  errors: string[];
  /** Options with incompatibilities auto-corrected (e.g. example downgraded to none). */
  corrected: CreateIcoreOptions;
}

/**
 * Validates option combinations and returns warnings + a corrected copy.
 * Safe to call from both interactive prompts and non-interactive flag paths.
 */
export function validateOptions(opts: CreateIcoreOptions): OptionsValidation {
  const warnings: string[] = [];
  const errors: string[] = [];
  let corrected = opts;

  if (hostOf(opts) === 'cloudflare') {
    const unsupported = (flag: string, value: string, supported: string): void => {
      errors.push(
        `--host=cloudflare does not support ${flag}=${value} (supported: ${supported}) — see docs/runbooks/cloudflare-workers-host.md`,
      );
    };
    if (opts.ui === 'none')
      errors.push(
        '--host=cloudflare does not support --ui=none (the Worker serves the built client) — see docs/runbooks/cloudflare-workers-host.md',
      );
    if (opts.authProvider !== 'supabase' && opts.authProvider !== 'none')
      unsupported('--auth', opts.authProvider, 'supabase, none');
    if (opts.dbProvider !== 'd1' && opts.dbProvider !== 'none')
      unsupported('--db', opts.dbProvider, 'd1, none');
    if (opts.upload !== 'r2' && opts.upload !== 'none')
      unsupported('--upload', opts.upload, 'r2, none');
    for (const [flag, value] of [
      ['--payment', opts.payment],
      ['--jobs', opts.jobs],
      ['--ai', opts.ai],
    ] as const) {
      if (value !== 'none') unsupported(flag, value, 'none');
    }
    // The Worker has exactly one transport and one session store; a different explicit value is
    // a mistake, the unset/default one is simply replaced.
    const isDefaultTransport = opts.transport === 'tcp';
    if (opts.transport !== 'local' && !isDefaultTransport)
      unsupported('--transport', opts.transport, 'local (implied)');
    if (
      opts.authProvider !== 'none' &&
      opts.session !== 'durable-object' &&
      opts.session !== 'redis'
    )
      unsupported('--session', opts.session, 'durable-object (implied)');
    corrected = {
      ...corrected,
      transport: 'local',
      session: opts.authProvider === 'none' ? 'redis' : 'durable-object',
    };
  } else {
    if (opts.transport === 'local')
      errors.push('--transport=local needs --host=cloudflare (it is an in-process transport)');
    if (opts.session === 'durable-object')
      errors.push('--session=durable-object needs --host=cloudflare');
  }

  // The notes sample persists through a DBStrategy; with db=none its db.provider is never wired and
  // the generated project fails to compile (imports a pruned @icore/db-* lib).
  if (opts.authProvider !== 'none' && opts.dbProvider === 'none' && opts.example === 'notes') {
    errors.push(
      '--example=notes needs a database: pass --db=<supabase|firebase|mongodb|postgres|sqlite|d1> or --example=none',
    );
  }

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

  if (opts.authProvider === 'none' && opts.session !== 'redis') {
    warnings.push('--session has no effect with auth=none (there are no sessions) — ignored');
    corrected = { ...corrected, session: 'redis' };
  }

  const everythingNone =
    opts.authProvider === 'none' &&
    opts.dbProvider === 'none' &&
    opts.upload === 'none' &&
    opts.payment === 'none' &&
    opts.jobs === 'none' &&
    opts.ai === 'none' &&
    opts.example === 'none' &&
    opts.ui === 'none';
  if (everythingNone) {
    warnings.push(
      'every option is "none" — only the bare NestJS gateway (apps/api) will be generated: no auth, database, upload, payment, jobs, AI, notes example or client',
    );
  }

  return { warnings, errors, corrected };
}

/** Missing `host` (older configs, tests) means the classic Node deployment. */
export function hostOf(opts: Pick<CreateIcoreOptions, 'host'>): HostKind {
  return opts.host ?? 'node';
}

export interface CreateIcoreOptions {
  projectName: string;
  /** Where the project runs: Node processes (default) or one Cloudflare Worker. */
  host?: HostKind;
  targetDir: string;
  authProvider: AuthProvider;
  dbProvider: DbProvider;
  upload: UploadProvider;
  payment: PaymentProvider;
  jobs: JobsProvider;
  ai: AiProvider;
  example: ExampleMode;
  ui: UiLibrary;
  transport: MsTransport;
  /** Where the gateway keeps login sessions: Redis (default) or in its own process. */
  session: SessionStoreKind;
  packageManager: PackageManager;
  initGit: boolean;
  install: boolean;
}
