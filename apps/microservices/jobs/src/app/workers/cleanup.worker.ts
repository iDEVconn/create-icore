import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { createJobsRedis } from '../redis-connection';
import type { CleanupJob } from '@icore/shared';

@Injectable()
export class CleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupWorker.name);
  private worker: Worker | null = null;
  private connection: IORedis | null = null;

  constructor(private readonly cfg: ConfigService) {}

  onModuleInit(): void {
    const url = this.cfg.get<string>('JOBS_REDIS_URL') ?? 'redis://localhost:6379';
    const concurrency = Number(this.cfg.get<string>('JOBS_WORKER_CONCURRENCY') ?? '5');
    this.connection = createJobsRedis(url, this.logger);
    this.worker = new Worker<CleanupJob>(
      'cleanup',
      async (job: Job<CleanupJob>) => {
        this.logger.log(`cleanup → ${job.data.kind} olderThan=${job.data.olderThanMs}ms`);
      },
      { connection: this.connection as never, concurrency },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`cleanup job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
