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
