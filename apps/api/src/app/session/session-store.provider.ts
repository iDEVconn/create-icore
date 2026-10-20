import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import {
  DurableObjectSessionStore,
  InMemorySessionStore,
  RedisSessionStore,
  SESSION_DO_NAMESPACE,
  type DurableObjectNamespaceLike,
  type SessionObjectStub,
  type SessionStore,
} from '@icore/shared';

export const SESSION_STORE = Symbol('SESSION_STORE');

export const sessionStoreProvider: Provider = {
  provide: SESSION_STORE,
  // The Durable Object namespace is provided only by the Cloudflare Workers host.
  inject: [ConfigService, { token: SESSION_DO_NAMESPACE, optional: true }],
  useFactory: (
    cfg: ConfigService,
    sessionNamespace?: DurableObjectNamespaceLike<SessionObjectStub>,
  ): SessionStore => {
    const logger = new Logger('SessionStore');
    const kind = (cfg.get<string>('SESSION_STORE') ?? 'redis').toLowerCase();

    if (kind === 'memory') {
      // Explicit opt-in for small, single-instance projects. Never silent: a
      // restart logs every user out and a second instance would not see these
      // sessions, so production needs a second, deliberate acknowledgment.
      if (
        cfg.get<string>('NODE_ENV') === 'production' &&
        cfg.get<string>('SESSION_STORE_ALLOW_MEMORY') !== 'true'
      ) {
        throw new Error(
          'SESSION_STORE=memory in production needs SESSION_STORE_ALLOW_MEMORY=true — sessions live in this process only (a restart logs everyone out; run exactly ONE gateway instance). Set SESSION_STORE=redis for anything else.',
        );
      }
      logger.warn(
        'SESSION_STORE=memory: sessions live in this process — a restart logs everyone out and only ONE gateway instance may run. Use SESSION_STORE=redis for anything else.',
      );
      return new InMemorySessionStore();
    }
    if (kind === 'durable-object') {
      if (!sessionNamespace) {
        throw new Error(
          'SESSION_STORE=durable-object needs the SESSION_DO_NAMESPACE Durable Object binding — it is only available when the gateway runs on the Cloudflare Workers host (apps/worker).',
        );
      }
      return new DurableObjectSessionStore(sessionNamespace);
    }
    if (kind !== 'redis') {
      throw new Error(
        `Unknown SESSION_STORE "${kind}" — expected "redis" (default), "memory" or "durable-object".`,
      );
    }

    const url = cfg.get<string>('SESSION_REDIS_URL');
    if (!url) {
      throw new Error(
        'SESSION_REDIS_URL is required when SESSION_STORE=redis (the default). To run without Redis, set SESSION_STORE=memory (single instance; a restart logs everyone out) — see docs/runbooks/bff-session-auth-migration.md.',
      );
    }
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
