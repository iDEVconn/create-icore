import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Transport } from '@nestjs/microservices';
import { buildTransport, buildTransportMS } from '../transport';
import { LocalClientProxy, LocalServer } from '../local-transport';

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
    const redis = opts.options as { retryAttempts: number; retryDelay: number };
    // Resilience: NestJS gives up (and app.listen() rejects) when retryAttempts
    // is unset — an effectively-infinite retry keeps reconnecting instead.
    expect(redis.retryAttempts).toBe(Number.POSITIVE_INFINITY);
    expect(redis.retryDelay).toBeGreaterThan(0);
  });

  // ioredis ignores a `url` key inside an options object (only `new Redis(url, opts)` parses a URL), and
  // Nest hands the options straight to `new Redis({ host, port, ...options })`. So the URL has to be
  // resolved to host/port/credentials here, otherwise every Redis URL silently connects to localhost:6379.
  describe('Redis URL is resolved to ioredis connection options', () => {
    type RedisOpts = {
      host: string;
      port: number;
      username?: string;
      password?: string;
      db?: number;
      tls?: object;
      url?: unknown;
    };
    const redisOptions = (url: string): RedisOpts => {
      process.env['AUTH_TRANSPORT'] = 'redis';
      process.env['AUTH_REDIS_URL'] = url;
      return buildTransport('AUTH').options as RedisOpts;
    };

    it('uses the host and port from the URL (not the localhost:6379 default)', () => {
      const o = redisOptions('redis://redis.internal:6390');
      expect(o.host).toBe('redis.internal');
      expect(o.port).toBe(6390);
      expect(o.url).toBeUndefined();
    });

    it('defaults the port to 6379 when the URL has none', () => {
      expect(redisOptions('redis://cache.local').port).toBe(6379);
    });

    it('passes password and db from the URL', () => {
      const o = redisOptions('redis://:s3cret@h:6380/2');
      expect(o.password).toBe('s3cret');
      expect(o.db).toBe(2);
      expect(o.username).toBeUndefined();
    });

    it('decodes percent-encoded credentials and keeps the username', () => {
      const o = redisOptions('redis://app:p%40ss%2Fword@h:6380');
      expect(o.username).toBe('app');
      expect(o.password).toBe('p@ss/word');
    });

    it('enables TLS for rediss://', () => {
      expect(redisOptions('rediss://secure.example:6380').tls).toBeDefined();
      expect(redisOptions('redis://plain.example:6380').tls).toBeUndefined();
    });

    it('rejects a URL that is not redis:// or rediss://', () => {
      process.env['AUTH_TRANSPORT'] = 'redis';
      process.env['AUTH_REDIS_URL'] = 'http://h:6379';
      expect(() => buildTransport('AUTH')).toThrow(/AUTH_REDIS_URL/);
    });
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
    const o = opts.options as { urls: string[]; queue: string; queueOptions: { durable: boolean } };
    expect(o.urls).toEqual(['amqp://localhost:5672']);
    expect(o.queue).toBe('auth_queue');
    expect(o.queueOptions.durable).toBe(true);
  });

  it('selects Kafka when ${PREFIX}_TRANSPORT=kafka (brokers + derived ids)', () => {
    process.env.AUTH_TRANSPORT = 'kafka';
    process.env.AUTH_KAFKA_BROKERS = 'localhost:9092,localhost:9093';
    const opts = buildTransport('AUTH');
    expect(opts.transport).toBe(Transport.KAFKA);
    const o = opts.options as {
      client: { brokers: string[]; clientId: string; retry: { retries: number } };
      consumer: { groupId: string };
    };
    expect(o.client.brokers).toEqual(['localhost:9092', 'localhost:9093']);
    expect(o.client.clientId).toBe('auth-client'); // derived from prefix
    expect(o.consumer.groupId).toBe('auth-consumer');
    // kafkajs's own default (retries: 5) exhausts after ~10s and rejects the
    // connect promise, crashing the process on a down broker -- infinite
    // retries is what keeps this transport idling-and-reconnecting instead,
    // matching every other broker transport's boot-resilience behavior.
    expect(o.client.retry.retries).toBe(Number.POSITIVE_INFINITY);
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

describe('local transport selection', () => {
  afterEach(() => {
    delete process.env['LOC_TRANSPORT'];
  });

  it('buildTransport returns the local client options when X_TRANSPORT=local', () => {
    process.env['LOC_TRANSPORT'] = 'local';
    expect(buildTransport('LOC')).toEqual({
      customClass: LocalClientProxy,
      options: { prefix: 'LOC' },
    });
  });

  it('buildTransportMS returns a LocalServer strategy for the same prefix', () => {
    process.env['LOC_TRANSPORT'] = 'local';
    const opts = buildTransportMS('LOC') as unknown as { strategy: unknown };
    expect(opts.strategy).toBeInstanceOf(LocalServer);
  });

  it('local needs no host, port or url env', () => {
    process.env['LOC_TRANSPORT'] = 'local';
    for (const k of Object.keys(process.env))
      if (k.startsWith('LOC_') && k !== 'LOC_TRANSPORT') delete process.env[k];
    expect(() => buildTransport('LOC')).not.toThrow();
    expect(() => buildTransportMS('LOC')).not.toThrow();
  });

  it('an unknown transport still throws', () => {
    process.env['LOC_TRANSPORT'] = 'carrier-pigeon';
    expect(() => buildTransport('LOC')).toThrow(/Unknown transport: carrier-pigeon/);
  });
});
