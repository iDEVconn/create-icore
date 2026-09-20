import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { RedisSessionStore, type SessionStore } from '@icore/shared';

export const SESSION_STORE = Symbol('SESSION_STORE');

export const sessionStoreProvider: Provider = {
  provide: SESSION_STORE,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): SessionStore => {
    const url = cfg.get<string>('SESSION_REDIS_URL');
    if (!url) {
      throw new Error(
        'SESSION_REDIS_URL is required — the BFF session model has no in-memory fallback for the gateway process (unlike optional per-feature Redis transports elsewhere in this repo, a session store losing state on restart would silently log every logged-in user out).',
      );
    }
    const logger = new Logger('SessionStore');
    // Request-path client, NOT a background worker: it must fail fast so a
    // Redis outage becomes AuthGuard's designed 503 instead of an HTTP
    // request that hangs until the client gives up.
    //   - maxRetriesPerRequest: 3 — bounded, unlike BullMQ's `null`
    //     (infinite), which is correct for a job worker and wrong here.
    //   - enableOfflineQueue: false — reject immediately while
    //     disconnected rather than queueing commands for a comeback that
    //     may never happen.
    const redis = new IORedis(url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
    });
    redis.on('error', (err: Error) => logger.warn(`Redis error: ${err.message}`));
    return new RedisSessionStore(redis);
  },
};
