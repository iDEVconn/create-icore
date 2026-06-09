import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBlueprintJson } from '../blueprint.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const opts: CreateIcoreOptions = {
  projectName: 'my-app',
  targetDir: '',
  authProvider: 'firebase',
  dbProvider: 'mongodb',
  upload: 'cloudinary',
  payment: 'paypal',
  jobs: 'bullmq',
  example: 'notes',
  ui: 'antd',
  transport: 'nats',
  packageManager: 'pnpm',
  initGit: true,
  install: true,
};

describe('writeBlueprintJson', () => {
  it('writes blueprint.json with the chosen selection (no transient fields)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-bp-'));
    await writeBlueprintJson(dir, { ...opts, targetDir: dir });
    const bp = JSON.parse(await readFile(join(dir, 'blueprint.json'), 'utf8'));
    expect(bp).toEqual({
      schemaVersion: 1,
      projectName: 'my-app',
      authProvider: 'firebase',
      dbProvider: 'mongodb',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'antd',
      transport: 'nats',
      packageManager: 'pnpm',
    });
    // transient fields excluded
    expect(bp).not.toHaveProperty('targetDir');
    expect(bp).not.toHaveProperty('install');
    expect(bp).not.toHaveProperty('initGit');
  });

  it('is deterministic (no timestamp) — two writes byte-match', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-bp-'));
    await writeBlueprintJson(dir, { ...opts, targetDir: dir });
    const a = await readFile(join(dir, 'blueprint.json'), 'utf8');
    await writeBlueprintJson(dir, { ...opts, targetDir: dir });
    const b = await readFile(join(dir, 'blueprint.json'), 'utf8');
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
  });
});
