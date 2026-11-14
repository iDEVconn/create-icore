import { vi } from 'vitest';
import { Logger } from '@nestjs/common';

// vi.mock is hoisted above the file's top-level statements, so the doubles it returns must be hoisted too.
// The constructors use `function` so `new` works on them.
const { onMock, quitMock, ioredisCtor, addMock, closeMock, queueCtor } = vi.hoisted(() => {
  const onMock = vi.fn();
  const quitMock = vi.fn().mockResolvedValue(undefined);
  const ioredisCtor = vi.fn().mockImplementation(function (url: string, opts: unknown) {
    return { url, opts, on: onMock, quit: quitMock };
  });
  const addMock = vi.fn();
  const closeMock = vi.fn().mockResolvedValue(undefined);
  const queueCtor = vi.fn().mockImplementation(function (name: string, opts: unknown) {
    return { name, opts, add: addMock, close: closeMock };
  });
  return { onMock, quitMock, ioredisCtor, addMock, closeMock, queueCtor };
});

vi.mock('ioredis', () => ({ default: ioredisCtor }));
vi.mock('bullmq', () => ({ Queue: queueCtor }));

import { JobsClientService } from '../jobs-client.service';

describe('JobsClientService', () => {
  beforeEach(() => {
    ioredisCtor.mockClear();
    onMock.mockClear();
    quitMock.mockClear();
    queueCtor.mockClear();
    addMock.mockReset();
    closeMock.mockClear();
  });

  it('connects with protocol 2 pinned and a never-give-up retry policy', () => {
    new JobsClientService('redis://localhost:6379');

    expect(ioredisCtor).toHaveBeenCalledTimes(1);
    const [, opts] = ioredisCtor.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts['protocol']).toBe(2);
    expect(opts['maxRetriesPerRequest']).toBeNull();
  });

  it('warns once on repeated connection errors instead of crashing', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    new JobsClientService('redis://localhost:6379');

    const errorHandler = onMock.mock.calls.find(([event]) => event === 'error')?.[1] as (
      err: Error,
    ) => void;
    expect(errorHandler).toBeInstanceOf(Function);

    errorHandler(new Error('ECONNREFUSED'));
    errorHandler(new Error('ECONNREFUSED'));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('getQueue lazily creates and caches one Queue instance per name', () => {
    const service = new JobsClientService('redis://localhost:6379');

    const first = service.getQueue('email');
    const second = service.getQueue('email');

    expect(first).toBe(second);
    expect(queueCtor).toHaveBeenCalledTimes(1);
  });

  it('enqueue merges default remove-on-complete/fail options with overrides', async () => {
    addMock.mockResolvedValue({ id: 'job-1' });
    const service = new JobsClientService('redis://localhost:6379');

    const result = await service.enqueue(
      'email',
      { to: 'a@b.com', subject: 's', body: 'b' },
      { delay: 5000 },
    );

    expect(addMock).toHaveBeenCalledWith(
      'email',
      { to: 'a@b.com', subject: 's', body: 'b' },
      { removeOnComplete: 1000, removeOnFail: 5000, delay: 5000 },
    );
    expect(result).toEqual({ id: 'job-1' });
  });

  it('enqueue falls back to an empty id when the job has none', async () => {
    addMock.mockResolvedValue({ id: undefined });
    const service = new JobsClientService('redis://localhost:6379');

    const result = await service.enqueue('cleanup', {
      kind: 'expired-magic-links',
      olderThanMs: 1000,
    });

    expect(result).toEqual({ id: '' });
  });

  it('listQueueNames returns every registered queue name', () => {
    const service = new JobsClientService('redis://localhost:6379');
    expect(service.listQueueNames()).toEqual(['email', 'image-process', 'cleanup']);
  });

  it('onModuleDestroy closes every created queue and quits the connection', async () => {
    const service = new JobsClientService('redis://localhost:6379');
    service.getQueue('email');
    service.getQueue('cleanup');

    await service.onModuleDestroy();

    expect(closeMock).toHaveBeenCalledTimes(2);
    expect(quitMock).toHaveBeenCalledTimes(1);
  });
});
