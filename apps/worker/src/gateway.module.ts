import { Module, type Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  DurableObjectThrottlerStorage,
  THROTTLER_DO_NAMESPACE,
  type DurableObjectNamespaceLike,
  type ThrottleObjectStub,
} from '@icore/shared';
import { WorkerBindingsModule } from './bindings.module';
import type { WorkerEnv } from './env';
import {
  AbilitiesModule,
  AuthModule,
  NotesModule,
  ProfileModule,
  StorageModule,
  throttlerOptions,
} from './hosted-apps';

/**
 * The gateway as the Worker runs it: `apps/api`'s own modules, with throttler counters in
 * Durable Objects (the default in-memory storage is per isolate, i.e. effectively off).
 * Features that need a long-lived process (jobs, bull-board, payment, ai) are not hosted.
 */
export function createGatewayModule(env: WorkerEnv): Type<unknown> {
  @Module({
    imports: [
      WorkerBindingsModule.forEnv(env),
      // Settings come from `process.env` (wrangler vars + secrets); there is no filesystem.
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      ThrottlerModule.forRootAsync({
        inject: [THROTTLER_DO_NAMESPACE],
        useFactory: (namespace: DurableObjectNamespaceLike<ThrottleObjectStub>) => ({
          throttlers: throttlerOptions,
          storage: new DurableObjectThrottlerStorage(namespace),
        }),
      }),
      AuthModule,
      AbilitiesModule,
      ProfileModule,
      StorageModule,
      NotesModule,
    ],
  })
  class WorkerGatewayModule {}
  return WorkerGatewayModule;
}
