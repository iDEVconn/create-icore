export type AuthProvider = 'supabase' | 'firebase';
export type DbProvider = 'supabase' | 'firebase';
export type UploadProvider = 'supabase' | 'firebase' | 'cloudinary' | 'none';
export type PaymentProvider = 'paypal' | 'none';
export type JobsProvider = 'bullmq' | 'none';
export type ExampleMode = 'notes' | 'none';
export type UiLibrary = 'shadcn' | 'antd' | 'mui';
export type MsTransport = 'tcp' | 'redis' | 'nats';
export type PackageManager = 'yarn' | 'npm' | 'pnpm';

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
