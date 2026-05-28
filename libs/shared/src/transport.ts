import { Transport, type ClientOptions } from '@nestjs/microservices';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function buildTransport(prefix: string): ClientOptions {
  const kind = (process.env[`${prefix}_TRANSPORT`] ?? 'tcp').toLowerCase();
  switch (kind) {
    case 'tcp':
      return {
        transport: Transport.TCP,
        options: {
          host: required(`${prefix}_HOST`),
          port: Number(required(`${prefix}_PORT`)),
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
