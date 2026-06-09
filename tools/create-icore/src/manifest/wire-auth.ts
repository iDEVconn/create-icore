import type { AuthProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';
import type { Unit } from './types.js';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from './wire-provider.js';

const AUTH: AxisWiring = {
  section: MANIFEST.auth as Record<string, Unit>,
  providerFile: 'apps/microservices/auth/src/app/auth.provider.ts',
  exportConst: 'AuthProviderModule',
  msPackageJson: 'apps/microservices/auth/package.json',
  envPath: 'apps/microservices/auth/.env',
};

export const writeAuthProvider = (targetDir: string, provider: AuthProvider): Promise<void> =>
  writeProvider(targetDir, AUTH, provider);

export const cleanupUnusedAuth = (targetDir: string, chosen: AuthProvider): Promise<void> =>
  cleanupUnusedAxis(targetDir, AUTH, chosen);
