import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Transport } from '@nestjs/microservices';
import { buildTransport } from '../transport';

const ORIG = { ...process.env };

describe('buildTransport', () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('AUTH_')) delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('AUTH_')) delete process.env[k];
    }
    Object.assign(process.env, ORIG);
  });

  it('defaults to TCP when ${PREFIX}_TRANSPORT is unset', () => {
    process.env.AUTH_HOST = '127.0.0.1';
    process.env.AUTH_PORT = '4001';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.TCP);
    const tcp = opts.options as { host: string; port: number };
    expect(tcp.host).toBe('127.0.0.1');
    expect(tcp.port).toBe(4001);
  });

  it('selects Redis when ${PREFIX}_TRANSPORT=redis', () => {
    process.env.AUTH_TRANSPORT = 'redis';
    process.env.AUTH_REDIS_URL = 'redis://localhost:6379';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.REDIS);
    const redis = opts.options as { url: string };
    expect(redis.url).toBe('redis://localhost:6379');
  });

  it('selects NATS when ${PREFIX}_TRANSPORT=nats', () => {
    process.env.AUTH_TRANSPORT = 'nats';
    process.env.AUTH_NATS_URL = 'nats://localhost:4222,nats://localhost:4223';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.NATS);
    const nats = opts.options as { servers: string[] };
    expect(nats.servers).toEqual(['nats://localhost:4222', 'nats://localhost:4223']);
  });

  it('throws on unknown transport', () => {
    process.env.AUTH_TRANSPORT = 'sqs';
    expect(() => buildTransport('AUTH')).toThrow(/sqs/);
  });

  it('throws when a required env var is missing', () => {
    process.env.AUTH_TRANSPORT = 'redis';
    expect(() => buildTransport('AUTH')).toThrow(/AUTH_REDIS_URL/);
  });
});
