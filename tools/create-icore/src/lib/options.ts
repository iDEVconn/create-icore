export type AuthProvider = 'supabase' | 'firebase';
export type StorageProvider = 'supabase' | 'firebase' | 'cloudinary';
export type UiLibrary = 'shadcn' | 'antd' | 'mui';
export type MsTransport = 'tcp' | 'redis' | 'nats';

export interface CreateIcoreOptions {
  projectName: string;
  targetDir: string;
  authProvider: AuthProvider;
  storageProvider: StorageProvider;
  ui: UiLibrary;
  transport: MsTransport;
  initGit: boolean;
  install: boolean;
}
