import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreateIcoreOptions } from '../lib/options.js';

export interface BlueprintJson {
  schemaVersion: 1;
  projectName: string;
  authProvider: string;
  dbProvider: string;
  upload: string;
  payment: string;
  jobs: string;
  example: string;
  ui: string;
  transport: string;
  packageManager: string;
}

/**
 * Record the scaffold selection at the project root. A provenance + audit-input
 * artifact ("what was this generated with?"). Transient fields (targetDir,
 * install, initGit) are excluded; no timestamp, so output is deterministic.
 */
export async function writeBlueprintJson(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const blueprint: BlueprintJson = {
    schemaVersion: 1,
    projectName: opts.projectName,
    authProvider: opts.authProvider,
    dbProvider: opts.dbProvider,
    upload: opts.upload,
    payment: opts.payment,
    jobs: opts.jobs,
    example: opts.example,
    ui: opts.ui,
    transport: opts.transport,
    packageManager: opts.packageManager,
  };
  await writeFile(join(targetDir, 'blueprint.json'), JSON.stringify(blueprint, null, 2) + '\n');
}

async function writeJson(targetDir: string, rel: string, data: unknown): Promise<void> {
  await writeFile(join(targetDir, rel, 'blueprint.json'), JSON.stringify(data, null, 2) + '\n');
}

/**
 * Per-service provenance: a small blueprint.json inside each PRESENT service dir
 * recording the selection relevant to it. Optional services that are off have no
 * dir (removed by scaffold), so they get no file.
 */
export async function writeServiceBlueprints(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const t = opts.transport;

  if (opts.authProvider !== 'none') {
    await writeJson(targetDir, 'apps/microservices/auth', {
      schemaVersion: 1,
      service: 'auth',
      authProvider: opts.authProvider,
      transport: t,
    });
  }

  if (opts.upload !== 'none') {
    await writeJson(targetDir, 'apps/microservices/upload', {
      schemaVersion: 1,
      service: 'upload',
      storageProvider: opts.upload,
      transport: t,
    });
  }

  if (opts.example !== 'none') {
    await writeJson(targetDir, 'apps/microservices/notes', {
      schemaVersion: 1,
      service: 'notes',
      dbProvider: opts.dbProvider,
      transport: t,
    });
  }

  if (opts.payment !== 'none') {
    await writeJson(targetDir, 'apps/microservices/payment', {
      schemaVersion: 1,
      service: 'payment',
      paymentProvider: opts.payment,
      transport: t,
    });
  }

  if (opts.jobs !== 'none') {
    await writeJson(targetDir, 'apps/microservices/jobs', {
      schemaVersion: 1,
      service: 'jobs',
      jobsProvider: opts.jobs,
    });
  }

  const features: string[] = [];
  if (opts.example !== 'none') features.push('notes');
  if (opts.payment !== 'none') features.push('payment');
  if (opts.jobs !== 'none') features.push('jobs');
  await writeJson(targetDir, 'apps/api', {
    schemaVersion: 1,
    service: 'api',
    features,
    transport: t,
  });

  await writeJson(targetDir, 'apps/client', {
    schemaVersion: 1,
    service: 'client',
    ui: opts.ui,
  });
}
