import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTestRedis } from './redis-test-server';

describe('startTestRedis', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails loudly (does not silently start a local server) when an explicit REDIS_TEST_URL is unreachable', async () => {
    vi.stubEnv('REDIS_TEST_URL', 'redis://127.0.0.1:1');
    await expect(startTestRedis()).rejects.toThrow(
      /REDIS_TEST_URL=redis:\/\/127\.0\.0\.1:1 is not reachable/,
    );
  });
});
