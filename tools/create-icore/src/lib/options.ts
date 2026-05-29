export type AuthProvider = 'supabase' | 'firebase';
export type DbProvider = 'supabase' | 'firebase';
export type UploadProvider = 'supabase' | 'firebase' | 'cloudinary' | 'none';
export type PaymentProvider = 'paypal' | 'none';
export type JobsProvider = 'bullmq' | 'none';
export type UiLibrary = 'shadcn' | 'antd' | 'mui';
export type MsTransport = 'tcp' | 'redis' | 'nats';

export interface CreateIcoreOptions {
  projectName: string;
  targetDir: string;
  authProvider: AuthProvider;
  dbProvider: DbProvider;
  upload: UploadProvider;
  payment: PaymentProvider;
  jobs: JobsProvider;
  ui: UiLibrary;
  transport: MsTransport;
  initGit: boolean;
  install: boolean;
}
