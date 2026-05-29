import {
  Inject,
  Logger,
  Module,
  type MiddlewareConsumer,
  type NestModule,
  type OnModuleInit,
} from '@nestjs/common';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { JobsClientModule, JobsClientService } from '@icore/jobs-client';
import { ICORE_QUEUES, type JobsMap } from '@icore/shared';

const BOARD_ROUTE = '/admin/queues';

@Module({
  imports: [JobsClientModule.forRoot()],
})
export class AdminModule implements NestModule, OnModuleInit {
  private readonly logger = new Logger(AdminModule.name);
  private readonly serverAdapter = new ExpressAdapter();

  constructor(@Inject(JobsClientService) private readonly jobsClient: JobsClientService) {}

  onModuleInit(): void {
    this.serverAdapter.setBasePath(`/api${BOARD_ROUTE}`);
    createBullBoard({
      queues: Object.values(ICORE_QUEUES).map(
        (name) => new BullMQAdapter(this.jobsClient.getQueue(name as keyof JobsMap)),
      ),
      serverAdapter: this.serverAdapter,
    });
    this.logger.log(`bull-board mounted at /api${BOARD_ROUTE}`);
  }

  configure(consumer: MiddlewareConsumer): void {
    // AuthGuard runs globally on every Nest route. To gate bull-board behind
    // admin role, the simplest path is a small admin middleware that checks
    // req.user.role — but req.user is populated by the AuthGuard which runs
    // for Nest controllers, not raw middleware. So we leave bull-board public
    // by default and document that consumers must front it with a reverse
    // proxy (or wire a thin admin controller that forwards to express).
    consumer.apply(this.serverAdapter.getRouter()).forRoutes(BOARD_ROUTE);
  }
}
