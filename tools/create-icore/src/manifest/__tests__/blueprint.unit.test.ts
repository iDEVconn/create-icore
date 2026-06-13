import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBlueprintJson, writeServiceBlueprints } from '../blueprint.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

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

describe('writeServiceBlueprints', () => {
  async function svcFixture(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'icore-svcbp-'));
    for (const p of [
      'apps/microservices/auth',
      'apps/microservices/upload',
      'apps/microservices/notes',
      'apps/microservices/payment',
      'apps/microservices/jobs',
      'apps/api',
      'apps/client',
    ]) {
      await mkdir(join(dir, p), { recursive: true });
    }
    return dir;
  }

  it('writes a blueprint.json per present service with its relevant selection', async () => {
    const dir = await svcFixture();
    // all features on
    await writeServiceBlueprints(dir, {
      ...opts,
      targetDir: dir,
      authProvider: 'supabase',
      dbProvider: 'mongodb',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'shadcn',
      transport: 'nats',
    });

    const read = async (p: string) =>
      JSON.parse(await readFile(join(dir, p, 'blueprint.json'), 'utf8'));

    expect(await read('apps/microservices/auth')).toEqual({
      schemaVersion: 1,
      service: 'auth',
      authProvider: 'supabase',
      transport: 'nats',
    });
    expect(await read('apps/microservices/upload')).toEqual({
      schemaVersion: 1,
      service: 'upload',
      storageProvider: 'cloudinary',
      transport: 'nats',
    });
    expect(await read('apps/microservices/notes')).toEqual({
      schemaVersion: 1,
      service: 'notes',
      dbProvider: 'mongodb',
      transport: 'nats',
    });
    expect(await read('apps/microservices/payment')).toEqual({
      schemaVersion: 1,
      service: 'payment',
      paymentProvider: 'paypal',
      transport: 'nats',
    });
    expect(await read('apps/microservices/jobs')).toEqual({
      schemaVersion: 1,
      service: 'jobs',
      jobsProvider: 'bullmq',
    });
    expect(await read('apps/api')).toEqual({
      schemaVersion: 1,
      service: 'api',
      features: ['notes', 'payment', 'jobs'],
      transport: 'nats',
    });
    expect(await read('apps/client')).toEqual({
      schemaVersion: 1,
      service: 'client',
      ui: 'shadcn',
    });
  });

  it('skips auth blueprint when authProvider=none', async () => {
    const dir = await svcFixture();
    await writeServiceBlueprints(dir, {
      ...opts,
      targetDir: dir,
      authProvider: 'none',
      dbProvider: 'none',
      example: 'none',
      upload: 'none',
      payment: 'none',
      jobs: 'none',
    });
    // auth blueprint should NOT exist (authProvider=none skips it)
    expect(await exists(join(dir, 'apps/microservices/auth/blueprint.json'))).toBe(false);
    // gateway blueprint should still exist
    expect(await exists(join(dir, 'apps/api/blueprint.json'))).toBe(true);
    // client blueprint should still exist
    expect(await exists(join(dir, 'apps/client/blueprint.json'))).toBe(true);
  });

  it('skips optional services that are off (no file written there)', async () => {
    const dir = await svcFixture();
    await writeServiceBlueprints(dir, {
      ...opts,
      targetDir: dir,
      upload: 'none',
      payment: 'none',
      jobs: 'none',
      example: 'none',
    });
    // optional ones: no blueprint.json (their dirs would be removed in real scaffolds)
    expect(await exists(join(dir, 'apps/microservices/upload/blueprint.json'))).toBe(false);
    expect(await exists(join(dir, 'apps/microservices/notes/blueprint.json'))).toBe(false);
    expect(await exists(join(dir, 'apps/microservices/payment/blueprint.json'))).toBe(false);
    expect(await exists(join(dir, 'apps/microservices/jobs/blueprint.json'))).toBe(false);
    // always-present
    expect(await exists(join(dir, 'apps/microservices/auth/blueprint.json'))).toBe(true);
    expect(await exists(join(dir, 'apps/api/blueprint.json'))).toBe(true);
    expect(await exists(join(dir, 'apps/client/blueprint.json'))).toBe(true);
    // api features empty when all off
    const api = JSON.parse(await readFile(join(dir, 'apps/api/blueprint.json'), 'utf8'));
    expect(api.features).toEqual([]);
  });
});
