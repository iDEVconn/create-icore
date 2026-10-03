import IORedis from 'ioredis';

export interface TestRedis {
  redis: IORedis;
  stop(): Promise<void>;
}

async function isReachable(url: string): Promise<boolean> {
  const probe = new IORedis(url, {
    lazyConnect: true,
    retryStrategy: () => null,
    connectTimeout: 500,
    maxRetriesPerRequest: 0,
  });
  probe.on('error', () => undefined);
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

/**
 * A REAL Redis for the session-store contract (distributed-lock correctness
 * cannot be faked). Uses REDIS_TEST_URL / localhost:6379 when reachable (CI's
 * service container, docker-compose); otherwise starts a throw-away local
 * server via redis-memory-server (first run compiles Redis once, ~1-2 min,
 * then cached). An explicit REDIS_TEST_URL that is unreachable is an error,
 * never a silent fallback.
 */
export async function startTestRedis(): Promise<TestRedis> {
  const explicit = process.env['REDIS_TEST_URL'];
  const url = explicit ?? 'redis://localhost:6379';
  if (await isReachable(url)) {
    const redis = new IORedis(url);
    return { redis, stop: async () => void (await redis.quit()) };
  }
  if (explicit) throw new Error(`REDIS_TEST_URL=${explicit} is not reachable`);

  const { RedisMemoryServer } = await import('redis-memory-server');
  const server = new RedisMemoryServer();
  const redis = new IORedis(await server.getPort(), await server.getHost());
  return {
    redis,
    stop: async () => {
      await redis.quit();
      await server.stop();
    },
  };
}
