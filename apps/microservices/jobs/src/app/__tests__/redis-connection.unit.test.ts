import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';

const { onMock, ioredisCtor } = vi.hoisted(() => {
  const onMock = vi.fn();
  const ioredisCtor = vi.fn().mockImplementation(function (url: string, opts: unknown) {
    return { url, opts, on: onMock };
  });
  return { onMock, ioredisCtor };
});

vi.mock('ioredis', () => ({ default: ioredisCtor }));

import { createJobsRedis } from '../redis-connection';

describe('createJobsRedis', () => {
  beforeEach(() => {
    ioredisCtor.mockClear();
    onMock.mockClear();
  });

  it('pins protocol 2 and never gives up on retries', () => {
    createJobsRedis('redis://localhost:6379', new Logger('test'));

    expect(ioredisCtor).toHaveBeenCalledTimes(1);
    const [, opts] = ioredisCtor.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts['protocol']).toBe(2);
    expect(opts['maxRetriesPerRequest']).toBeNull();
    expect(typeof opts['retryStrategy']).toBe('function');
  });

  it('caps the retry backoff at 5000ms', () => {
    createJobsRedis('redis://localhost:6379', new Logger('test'));

    const [, opts] = ioredisCtor.mock.calls[0] as [
      string,
      { retryStrategy: (t: number) => number },
    ];
    expect(opts.retryStrategy(1)).toBe(200);
    expect(opts.retryStrategy(100)).toBe(5000);
  });

  it('warns once on connection errors instead of crashing the process', () => {
    const logger = new Logger('test');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    createJobsRedis('redis://localhost:6379', logger);

    const errorHandler = onMock.mock.calls.find(([event]) => event === 'error')?.[1] as (
      err: Error,
    ) => void;
    expect(errorHandler).toBeInstanceOf(Function);

    errorHandler(new Error('ECONNREFUSED'));
    errorHandler(new Error('ECONNREFUSED'));
    errorHandler(new Error('ECONNREFUSED'));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('jobs MS');
  });
});
