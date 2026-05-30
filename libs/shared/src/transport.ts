import { Transport, type ClientOptions, type MicroserviceOptions } from '@nestjs/microservices';
import { formatEnvBanner } from './env';

// Transport vars each kind needs (besides ${prefix}_TRANSPORT itself).
function transportKeys(prefix: string, kind: string): string[] {
  switch (kind) {
    case 'tcp':
      return [`${prefix}_HOST`, `${prefix}_PORT`];
    case 'redis':
      return [`${prefix}_REDIS_URL`];
    case 'nats':
      return [`${prefix}_NATS_URL`];
    default:
      return [];
  }
}

/**
 * Throws an eye-catching banner if any transport var for `prefix` is missing.
 * Used by both the gateway client modules and each MS bootstrap, so transport
 * misconfiguration surfaces clearly instead of a raw "Missing env var".
 */
function assertTransportEnv(prefix: string, kind: string): void {
  const keys = transportKeys(prefix, kind);
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      formatEnvBanner({
        service: `${prefix} transport`,
        provider: kind,
        missing,
        envPath: `the service .env (${prefix}_* transport vars)`,
        headline: `⚠  ${prefix} transport (${kind}) not configured — cannot reach the microservice`,
      }),
    );
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function requiredPort(name: string): number {
  const raw = required(name);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid ${name}: expected integer 1-65535, got ${raw}`);
  }
  return port;
}

export function buildTransport(prefix: string): ClientOptions {
  const kind = (process.env[`${prefix}_TRANSPORT`] ?? 'tcp').toLowerCase();
  assertTransportEnv(prefix, kind);
  switch (kind) {
    case 'tcp':
      return {
        transport: Transport.TCP,
        options: {
          host: required(`${prefix}_HOST`),
          port: requiredPort(`${prefix}_PORT`),
        },
      };
    case 'redis':
      // ioredis accepts a connection URL string; the NestJS RedisOptions type
      // exposes host/port fields but passes options directly to ioredis which
      // also accepts a url field at runtime.
      //
      // retryAttempts/retryDelay are mandatory for resilience: NestJS
      // ServerRedis builds its ioredis retryStrategy from them, and when
      // retryAttempts is unset it logs "retry attempts not specified", stops
      // reconnecting, and `app.listen()` REJECTS → the MS process exits. With
      // an effectively-infinite retry the initial connect stays pending and
      // keeps reconnecting, so a not-yet-up Redis never crashes the service —
      // it idles and attaches once Redis is reachable.
      return {
        transport: Transport.REDIS,
        options: {
          url: required(`${prefix}_REDIS_URL`),
          retryAttempts: Number.POSITIVE_INFINITY,
          retryDelay: 2000,
        },
      } as unknown as ClientOptions;
    case 'nats':
      // reconnect/maxReconnectAttempts: -1 retries forever once connected, so a
      // dropped broker re-attaches instead of giving up. The *initial* connect
      // is intentionally allowed to reject when NATS is down on boot —
      // bootstrapMicroservice() catches that, logs a banner, and retries, giving
      // the same visible behaviour as the Redis transport above.
      return {
        transport: Transport.NATS,
        options: {
          servers: required(`${prefix}_NATS_URL`).split(','),
          reconnect: true,
          maxReconnectAttempts: -1,
          reconnectTimeWait: 2000,
        },
      } as unknown as ClientOptions;
    default:
      throw new Error(`Unknown transport: ${kind}`);
  }
}

/**
 * Same env contract as {@link buildTransport}, but typed for the server
 * side: pass the result directly to `NestFactory.createMicroservice(...)`.
 * Eliminates the `as unknown as MicroserviceOptions` cast at every MS
 * bootstrap site.
 */
export function buildTransportMS(prefix: string): MicroserviceOptions {
  return buildTransport(prefix) as unknown as MicroserviceOptions;
}
