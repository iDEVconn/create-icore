import { formatEnvBanner } from './env';

interface MicroserviceLike {
  listen: () => Promise<unknown>;
  close: () => Promise<void>;
}

interface LoggerLike {
  log: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string, trace?: unknown) => void;
}

const RETRY_DELAY_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Boots a microservice and binds its transport, surviving a broker that isn't
 * up yet.
 *
 * NestJS `ServerRedis`/`ServerNats` REJECT `app.listen()` on the *initial*
 * connect failure — the ioredis retryStrategy / NATS reconnect only governs
 * re-connection after a first successful connect. So without this helper a MS
 * would `process.exit(1)` whenever Redis/NATS is down on boot, even though the
 * transport options ask for infinite retries.
 *
 * Behaviour (honours the "never crash on missing infra" rule):
 *  - tcp transport, or NODE_ENV=production → fail fast: `process.exit(1)`.
 *  - redis/nats in dev → log a boxed banner and retry `listen()` forever, so
 *    the service idles until the broker appears, then binds automatically.
 *
 * `createApp` must construct a *fresh* app each call: a failed listen closes
 * the transport's clients, so the next attempt needs a new instance.
 */
export async function bootstrapMicroservice(
  prefix: string,
  createApp: () => Promise<MicroserviceLike>,
  logger: LoggerLike,
): Promise<void> {
  const transport = (process.env[`${prefix}_TRANSPORT`] ?? 'tcp').toLowerCase();
  const isProd = process.env['NODE_ENV'] === 'production';
  const failFast = transport === 'tcp' || isProd;

  for (let attempt = 1; ; attempt++) {
    let app: MicroserviceLike | undefined;
    try {
      app = await createApp();
      await app.listen();
      logger.log(`${prefix} microservice listening — transport=${transport}`);
      return;
    } catch (err) {
      if (app) await app.close().catch(() => undefined);
      const reason = err instanceof Error ? err.message : String(err);

      if (failFast) {
        logger.error(
          `${prefix} microservice bootstrap failed`,
          err instanceof Error ? err.stack : err,
        );
        process.exit(1);
      }

      logger.warn(
        formatEnvBanner({
          service: `${prefix} microservice`,
          provider: transport,
          missing: [],
          envPath: `the service .env (${prefix}_${transport.toUpperCase()}_URL)`,
          reason: `${reason} — retry ${attempt} in ${RETRY_DELAY_MS / 1000}s; idling until the ${transport} broker is reachable`,
          headline: `⚠  ${prefix} microservice — ${transport} broker unreachable (idling, not crashing)`,
        }),
      );
      await delay(RETRY_DELAY_MS);
    }
  }
}
