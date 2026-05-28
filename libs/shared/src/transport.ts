import { Transport, type ClientOptions } from '@nestjs/microservices';

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
      return {
        transport: Transport.REDIS,
        options: { url: required(`${prefix}_REDIS_URL`) },
      } as unknown as ClientOptions;
    case 'nats':
      return {
        transport: Transport.NATS,
        options: { servers: required(`${prefix}_NATS_URL`).split(',') },
      };
    default:
      throw new Error(`Unknown transport: ${kind}`);
  }
}
