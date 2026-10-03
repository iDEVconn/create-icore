import { describe, expect, it } from 'vitest';
import { mkdtemp, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteComposeSession, rewriteComposeTransport } from '../scaffold-env.js';
import type { CreateIcoreOptions } from '../options.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

async function compose(over: Partial<CreateIcoreOptions>): Promise<string> {
  const opts = {
    authProvider: 'supabase',
    transport: 'tcp',
    jobs: 'none',
    session: 'redis',
    ...over,
  } as CreateIcoreOptions;
  const dir = await mkdtemp(join(tmpdir(), 'icore-compose-session-'));
  await copyFile(join(repoRoot, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
  await rewriteComposeTransport(dir, opts);
  await rewriteComposeSession(dir, opts);
  return readFile(join(dir, 'docker-compose.yml'), 'utf8');
}

describe('rewriteComposeSession', () => {
  it('redis: leaves the compose untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-compose-session-'));
    await copyFile(join(repoRoot, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
    const before = await readFile(join(dir, 'docker-compose.yml'), 'utf8');
    await rewriteComposeSession(dir, {
      authProvider: 'supabase',
      transport: 'tcp',
      jobs: 'none',
      session: 'redis',
    } as CreateIcoreOptions);
    expect(await readFile(join(dir, 'docker-compose.yml'), 'utf8')).toBe(before);
  });

  it('memory + nothing else needing Redis: gateway runs in-memory and the Redis service, volume and every depends_on are gone', async () => {
    const c = await compose({ session: 'memory' });
    expect(c).toContain('SESSION_STORE: memory');
    expect(c).toContain("SESSION_STORE_ALLOW_MEMORY: 'true'");
    expect(c).not.toContain('SESSION_REDIS_URL');
    expect(c).not.toMatch(/\n {2}redis:\n/);
    expect(c).not.toContain('icore_redis_data');
    expect(c).not.toMatch(/depends_on:\n(?: {6}.*\n)*? {6}redis:/);
    expect(c).not.toContain('redis:7-alpine');
  });

  it('memory + jobs=bullmq: the Redis service STAYS (BullMQ needs it) but the gateway still skips Redis for sessions', async () => {
    const c = await compose({ session: 'memory', jobs: 'bullmq' });
    expect(c).toContain('SESSION_STORE: memory');
    expect(c).not.toContain('SESSION_REDIS_URL');
    expect(c).toMatch(/\n {2}redis:\n/);
    expect(c).toContain('icore_redis_data');
  });

  it('memory + transport=redis: the Redis service STAYS (the transport needs it)', async () => {
    const c = await compose({ session: 'memory', transport: 'redis' });
    expect(c).toContain('SESSION_STORE: memory');
    expect(c).toMatch(/\n {2}redis:\n/);
  });

  it('auth=none: compose untouched even with session=memory (there are no sessions)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-compose-session-'));
    await copyFile(join(repoRoot, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
    const before = await readFile(join(dir, 'docker-compose.yml'), 'utf8');
    await rewriteComposeSession(dir, {
      authProvider: 'none',
      transport: 'tcp',
      jobs: 'none',
      session: 'memory',
    } as CreateIcoreOptions);
    expect(await readFile(join(dir, 'docker-compose.yml'), 'utf8')).toBe(before);
  });

  it('is a no-op when docker-compose.yml is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-compose-session-'));
    await expect(
      rewriteComposeSession(dir, {
        authProvider: 'supabase',
        transport: 'tcp',
        jobs: 'none',
        session: 'memory',
      } as CreateIcoreOptions),
    ).resolves.toBeUndefined();
  });
});
