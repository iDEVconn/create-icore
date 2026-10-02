import { describe, expect, it } from 'vitest';
import { mkdtemp, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteComposeTransport } from '../scaffold-env.js';
import type { CreateIcoreOptions } from '../options.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

// Real repo docker-compose.yml, not a synthetic fixture.
async function run(transport: CreateIcoreOptions['transport']): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-compose-'));
  await copyFile(join(repoRoot, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
  await rewriteComposeTransport(dir, { transport } as CreateIcoreOptions);
  return readFile(join(dir, 'docker-compose.yml'), 'utf8');
}

function block(compose: string, service: string): string {
  const m = compose.match(
    new RegExp(`\\n {2}${service}:\\n[\\s\\S]+?(?=\\n {2}\\w+:|\\nnetworks:)`),
  );
  return m?.[0] ?? '';
}

describe('rewriteComposeTransport', () => {
  it('redis: leaves compose untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-compose-'));
    await copyFile(join(repoRoot, 'docker-compose.yml'), join(dir, 'docker-compose.yml'));
    const before = await readFile(join(dir, 'docker-compose.yml'), 'utf8');
    await rewriteComposeTransport(dir, { transport: 'redis' } as CreateIcoreOptions);
    expect(await readFile(join(dir, 'docker-compose.yml'), 'utf8')).toBe(before);
  });

  it('tcp: auth/upload MS bind a port and no longer depend on redis', async () => {
    const compose = await run('tcp');
    for (const [svc, prefix, port] of [
      ['auth', 'AUTH', 4001],
      ['upload', 'UPLOAD', 4002],
    ] as const) {
      const b = block(compose, svc);
      expect(b).toContain(`${prefix}_TRANSPORT: tcp`);
      expect(b).toContain(`${prefix}_HOST: 0.0.0.0`);
      expect(b).toContain(`${prefix}_PORT: ${port}`);
      expect(b).not.toContain('REDIS');
      expect(b).not.toContain('depends_on');
    }
  });

  it('tcp: gateway targets MS service names, keeps redis for BFF sessions', async () => {
    const gw = block(await run('tcp'), 'gateway');
    expect(gw).toContain('AUTH_HOST: auth');
    expect(gw).toContain('UPLOAD_HOST: upload');
    expect(gw).not.toContain('AUTH_REDIS_URL');
    expect(gw).not.toContain('UPLOAD_REDIS_URL');
    expect(gw).toContain('SESSION_REDIS_URL: redis://redis:6379');
    expect(gw).toMatch(/depends_on:\n\s+redis:/);
  });

  it('tcp: no AUTH/UPLOAD redis transport left anywhere', async () => {
    const compose = await run('tcp');
    expect(compose).not.toMatch(/(AUTH|UPLOAD)_TRANSPORT: redis/);
  });

  it('broker transport (nats): flips transport value, drops redis URL', async () => {
    const compose = await run('nats');
    expect(compose).toContain('AUTH_TRANSPORT: nats');
    expect(compose).toContain('UPLOAD_TRANSPORT: nats');
    expect(compose).not.toContain('AUTH_REDIS_URL');
    expect(compose).not.toContain('UPLOAD_REDIS_URL');
  });

  it('is a no-op when docker-compose.yml is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-compose-'));
    await expect(
      rewriteComposeTransport(dir, { transport: 'tcp' } as CreateIcoreOptions),
    ).resolves.toBeUndefined();
  });
});
