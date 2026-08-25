import { Logger } from '@nestjs/common';

const onMock = jest.fn();
const quitMock = jest.fn().mockResolvedValue(undefined);
const ioredisCtor = jest.fn().mockImplementation((url: string, opts: unknown) => ({
  url,
  opts,
  on: onMock,
  quit: quitMock,
}));

jest.mock('ioredis', () => ioredisCtor);

const addMock = jest.fn();
const closeMock = jest.fn().mockResolvedValue(undefined);
const queueCtor = jest.fn().mockImplementation((name: string, opts: unknown) => ({
  name,
  opts,
  add: addMock,
  close: closeMock,
}));

jest.mock('bullmq', () => ({ Queue: queueCtor }));

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
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

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
