import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapMicroservice } from '../bootstrap';

interface FakeApp {
  listen: () => Promise<void>;
  close: () => Promise<void>;
}

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const ORIG = { ...process.env };

describe('bootstrapMicroservice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env['AUTH_TRANSPORT'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.assign(process.env, ORIG);
  });

  it('redis in dev: retries with a banner instead of exiting, then binds when the broker appears', async () => {
    process.env['AUTH_TRANSPORT'] = 'redis';
    const logger = makeLogger();
    const close = vi.fn().mockResolvedValue(undefined);
    let attempts = 0;
    const createApp = vi.fn(async (): Promise<FakeApp> => {
      attempts += 1;
      return {
        // first attempt fails (broker down), second succeeds
        listen:
          attempts < 2 ? () => Promise.reject(new Error('ECONNREFUSED')) : () => Promise.resolve(),
        close,
      };
    });

    const done = bootstrapMicroservice('AUTH', createApp, logger);
    // let the first attempt fail + the retry delay elapse
    await vi.advanceTimersByTimeAsync(3000);
    await done;

    expect(createApp).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1); // failed app cleaned up before retry
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('broker unreachable');
    expect(logger.log).toHaveBeenCalledTimes(1); // "listening" on success
  });

  it('tcp: fails fast (process.exit) rather than retrying', async () => {
    process.env['AUTH_TRANSPORT'] = 'tcp';
    const logger = makeLogger();
    const exit = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('__exit__');
    }) as never);
    const createApp = vi.fn(
      async (): Promise<FakeApp> => ({
        listen: () => Promise.reject(new Error('EADDRINUSE')),
        close: () => Promise.resolve(),
      }),
    );

    await expect(bootstrapMicroservice('AUTH', createApp, logger)).rejects.toThrow('__exit__');
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('production: fails fast even on a broker transport', async () => {
    process.env['AUTH_TRANSPORT'] = 'redis';
    process.env['NODE_ENV'] = 'production';
    const logger = makeLogger();
    const exit = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('__exit__');
    }) as never);
    const createApp = vi.fn(
      async (): Promise<FakeApp> => ({
        listen: () => Promise.reject(new Error('ECONNREFUSED')),
        close: () => Promise.resolve(),
      }),
    );

    await expect(bootstrapMicroservice('AUTH', createApp, logger)).rejects.toThrow('__exit__');
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
