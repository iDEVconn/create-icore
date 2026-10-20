import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { D1_DATABASE_BINDING } from '@icore/db-d1';
import { SESSION_DO_NAMESPACE, THROTTLER_DO_NAMESPACE } from '@icore/shared';
import type { WorkerEnv } from './env';

/**
 * Exposes the Worker's bindings as global Nest providers, so strategies that run
 * in this isolate (session store, throttler storage, D1) can pick them up through
 * the tokens their modules declare as optional.
 */
@Module({})
export class WorkerBindingsModule {
  static forEnv(env: WorkerEnv): DynamicModule {
    const providers: Provider[] = [
      { provide: SESSION_DO_NAMESPACE, useValue: env.SESSIONS },
      { provide: THROTTLER_DO_NAMESPACE, useValue: env.THROTTLE },
    ];
    // Optional: a project without a D1 database has no `DB` binding.
    if (env.DB) providers.push({ provide: D1_DATABASE_BINDING, useValue: env.DB });
    return {
      module: WorkerBindingsModule,
      global: true,
      providers,
      exports: providers.map((p) => (p as { provide: string }).provide),
    };
  }
}
