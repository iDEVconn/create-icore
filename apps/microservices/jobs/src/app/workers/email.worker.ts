import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { EmailJob } from '@icore/shared';

@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker: Worker | null = null;
  private connection: IORedis | null = null;

  constructor(private readonly cfg: ConfigService) {}

  onModuleInit(): void {
    const url = this.cfg.get<string>('JOBS_REDIS_URL') ?? 'redis://localhost:6379';
    const concurrency = Number(this.cfg.get<string>('JOBS_WORKER_CONCURRENCY') ?? '5');
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.worker = new Worker<EmailJob>(
      'email',
      async (job: Job<EmailJob>) => {
        this.logger.log(`email → ${job.data.to} (${job.data.subject})`);
        // Stub: consumers replace this body with real send logic.
      },
      { connection: this.connection as never, concurrency },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`email job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
