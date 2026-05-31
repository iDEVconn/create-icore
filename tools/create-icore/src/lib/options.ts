export type AuthProvider = 'supabase' | 'firebase';
export type DbProvider = 'supabase' | 'firebase';
export type UploadProvider = 'supabase' | 'firebase' | 'cloudinary' | 'none';
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
