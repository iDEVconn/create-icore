import type { DbProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';
import type { Unit } from './types.js';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from './wire-provider.js';

const DB: AxisWiring = {
  section: MANIFEST.db as Record<string, Unit>,
  providerFile: 'apps/microservices/notes/src/app/db.provider.ts',
  exportConst: 'DbProviderModule',
  msPackageJson: 'apps/microservices/notes/package.json',
  envPath: 'apps/microservices/notes/.env',
};

export const writeDbProvider = (targetDir: string, provider: DbProvider): Promise<void> =>
  writeProvider(targetDir, DB, provider);

export const cleanupUnusedDb = (targetDir: string, chosen: DbProvider): Promise<void> =>
  cleanupUnusedAxis(targetDir, DB, chosen);
