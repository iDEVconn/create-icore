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
import { AuthModule } from '../auth/auth.module';
import { BullBoardAuthMiddleware } from './bull-board-auth.middleware';

const BOARD_ROUTE = '/admin/queues';

@Module({
  imports: [JobsClientModule.forRoot(), AuthModule],
  providers: [BullBoardAuthMiddleware],
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
    // AuthGuard runs globally on Nest controller routes but the bull-board
    // router is mounted as raw Express middleware, so it never passes through
    // the guard pipeline. BullBoardAuthMiddleware re-checks the bearer token
    // and admin role directly, ahead of the board router.
    consumer.apply(BullBoardAuthMiddleware).forRoutes(BOARD_ROUTE);
    consumer.apply(this.serverAdapter.getRouter()).forRoutes(BOARD_ROUTE);
  }
}
