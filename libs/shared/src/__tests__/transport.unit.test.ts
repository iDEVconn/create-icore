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
    process.env['AUTH_HOST'] = '127.0.0.1';
    process.env['AUTH_PORT'] = '4001';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.TCP);
    const tcp = opts.options as { host: string; port: number };
    expect(tcp.host).toBe('127.0.0.1');
    expect(tcp.port).toBe(4001);
  });

  it('selects Redis when ${PREFIX}_TRANSPORT=redis', () => {
    process.env['AUTH_TRANSPORT'] = 'redis';
    process.env['AUTH_REDIS_URL'] = 'redis://localhost:6379';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.REDIS);
    const redis = opts.options as { url: string; retryAttempts: number; retryDelay: number };
    expect(redis.url).toBe('redis://localhost:6379');
    // Resilience: NestJS gives up (and app.listen() rejects) when retryAttempts
    // is unset — an effectively-infinite retry keeps reconnecting instead.
    expect(redis.retryAttempts).toBe(Number.POSITIVE_INFINITY);
    expect(redis.retryDelay).toBeGreaterThan(0);
  });

  it('selects NATS when ${PREFIX}_TRANSPORT=nats', () => {
    process.env['AUTH_TRANSPORT'] = 'nats';
    process.env['AUTH_NATS_URL'] = 'nats://localhost:4222,nats://localhost:4223';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.NATS);
    const nats = opts.options as {
      servers: string[];
      reconnect: boolean;
      maxReconnectAttempts: number;
    };
    expect(nats.servers).toEqual(['nats://localhost:4222', 'nats://localhost:4223']);
    // Resilience: reconnect forever once connected (the initial connect is left
    // to reject so bootstrapMicroservice() can banner + retry).
    expect(nats.reconnect).toBe(true);
    expect(nats.maxReconnectAttempts).toBe(-1);
  });

  it('selects MQTT when ${PREFIX}_TRANSPORT=mqtt', () => {
    process.env.AUTH_TRANSPORT = 'mqtt';
    process.env.AUTH_MQTT_URL = 'mqtt://localhost:1883';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.MQTT);
    expect((opts.options as { url: string }).url).toBe('mqtt://localhost:1883');
  });

  it('selects RMQ when ${PREFIX}_TRANSPORT=rmq', () => {
    process.env.AUTH_TRANSPORT = 'rmq';
    process.env.AUTH_RMQ_URL = 'amqp://localhost:5672';
    process.env.AUTH_RMQ_QUEUE = 'auth_queue';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.RMQ);
    const o = opts.options as { urls: string[]; queue: string };
    expect(o.urls).toEqual(['amqp://localhost:5672']);
    expect(o.queue).toBe('auth_queue');
  });

  it('selects Kafka when ${PREFIX}_TRANSPORT=kafka (brokers + derived ids)', () => {
    process.env.AUTH_TRANSPORT = 'kafka';
    process.env.AUTH_KAFKA_BROKERS = 'localhost:9092,localhost:9093';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.KAFKA);
    const o = opts.options as {
      client: { brokers: string[]; clientId: string };
      consumer: { groupId: string };
    };
    expect(o.client.brokers).toEqual(['localhost:9092', 'localhost:9093']);
    expect(o.client.clientId).toBe('auth-client'); // derived from prefix
    expect(o.consumer.groupId).toBe('auth-consumer');
  });

  it('throws when a broker var is missing (rmq needs queue)', () => {
    process.env.AUTH_TRANSPORT = 'rmq';
    process.env.AUTH_RMQ_URL = 'amqp://localhost:5672';
    expect(() => buildTransport('AUTH')).toThrow(/AUTH_RMQ_QUEUE/);
  });

  it('throws on unknown transport', () => {
    process.env['AUTH_TRANSPORT'] = 'sqs';
    expect(() => buildTransport('AUTH')).toThrow(/sqs/);
  });

  it('throws when a required env var is missing', () => {
    process.env['AUTH_TRANSPORT'] = 'redis';
    expect(() => buildTransport('AUTH')).toThrow(/AUTH_REDIS_URL/);
  });
});
