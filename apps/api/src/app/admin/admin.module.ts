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
import { SessionModule } from '../session/session.module';
import { BullBoardAuthMiddleware } from './bull-board-auth.middleware';

const BOARD_ROUTE = '/admin/queues';

@Module({
  // AuthModule is no longer imported here: the board gate resolves the
  // session cookie against SESSION_STORE directly and never calls the auth
  // microservice, so SessionModule is the only auth-side dependency left.
  imports: [JobsClientModule.forRoot(), SessionModule],
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
    // the guard pipeline. BullBoardAuthMiddleware resolves the icore_sid
    // session cookie and re-checks the admin role directly, ahead of the
    // board router.
    consumer.apply(BullBoardAuthMiddleware).forRoutes(BOARD_ROUTE);
    consumer.apply(this.serverAdapter.getRouter()).forRoutes(BOARD_ROUTE);
  }
}
