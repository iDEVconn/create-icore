import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { ICORE_QUEUES, type JobsMap } from '@icore/shared';
import { JOBS_REDIS_URL } from './jobs-client.tokens';

@Injectable()
export class JobsClientService implements OnModuleDestroy {
  private readonly logger = new Logger(JobsClientService.name);
  private readonly connection: IORedis;
  private readonly queues = new Map<string, Queue>();

  constructor(@Inject(JOBS_REDIS_URL) redisUrl: string) {
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    // Without an 'error' handler ioredis throws an unhandled 'error' event and
    // crashes the host process when Redis is down. Log once, keep retrying.
    let warned = false;
    this.connection.on('error', (err: Error) => {
      if (warned) return;
      warned = true;
      this.logger.warn(`Redis unreachable at ${redisUrl}: ${err.message}. enqueue() will retry.`);
    });
  }

  async enqueue<K extends keyof JobsMap>(
    name: K,
    data: JobsMap[K],
    opts?: JobsOptions,
  ): Promise<{ id: string }> {
    const queue = this.getQueue(name);
    const job = await queue.add(name, data, {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      ...opts,
    });
    return { id: job.id ?? '' };
  }

  getQueue(name: keyof JobsMap): Queue {
    let q = this.queues.get(name);
    if (!q) {
      // bullmq's Connection type and ioredis's strict protected-member guards
      // disagree at the structural level; the runtime is fine.
      q = new Queue(name, { connection: this.connection as never });
      this.queues.set(name, q);
    }
    return q;
  }

  listQueueNames(): string[] {
    return Object.values(ICORE_QUEUES);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }
}
