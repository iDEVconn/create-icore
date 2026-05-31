import { Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import { formatEnvBanner } from '@icore/shared';

/**
 * Creates an IORedis connection that NEVER crashes the process when Redis is
 * unreachable. Without an 'error' handler, ioredis emits an unhandled 'error'
 * event → Node exits. Here we log one boxed banner and let ioredis keep
 * retrying in the background, so the jobs MS stays up and connects once Redis
 * is available (honours the "never crash on missing infra" rule).
 */
export function createJobsRedis(url: string, logger: Logger): IORedis {
  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  let warned = false;
  connection.on('error', (err: Error) => {
    if (warned) return;
    warned = true;
    logger.warn(
      formatEnvBanner({
        service: 'jobs MS',
        provider: 'redis',
        missing: [],
        envPath: 'apps/microservices/jobs/.env (JOBS_REDIS_URL)',
        reason: `${err.message} — retrying in the background until Redis is up at ${url}`,
        headline: `⚠  jobs MS — Redis unreachable (workers idle until it's up)`,
      }),
    );
  });

  return connection;
}
