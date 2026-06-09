import type { StorageProvider } from './types.js';
import { MANIFEST } from './index.js';
import type { Unit } from './types.js';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from './wire-provider.js';

const STORAGE: AxisWiring = {
  section: MANIFEST.storage as Record<string, Unit>,
  providerFile: 'apps/microservices/upload/src/app/storage.provider.ts',
  exportConst: 'StorageProviderModule',
  msPackageJson: 'apps/microservices/upload/package.json',
  envPath: 'apps/microservices/upload/.env',
};

export const writeStorageProvider = (targetDir: string, provider: StorageProvider): Promise<void> =>
  writeProvider(targetDir, STORAGE, provider);

export const cleanupUnusedStorage = (targetDir: string, chosen: StorageProvider): Promise<void> =>
  cleanupUnusedAxis(targetDir, STORAGE, chosen);
