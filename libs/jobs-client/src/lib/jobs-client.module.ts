import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsClientService } from './jobs-client.service';

export const JOBS_REDIS_URL = 'JOBS_REDIS_URL';

@Module({})
export class JobsClientModule {
  static forRoot(): DynamicModule {
    return {
      module: JobsClientModule,
      providers: [
        {
          provide: JOBS_REDIS_URL,
          useFactory: (cfg: ConfigService): string =>
            cfg.get<string>('JOBS_REDIS_URL') ?? 'redis://localhost:6379',
          inject: [ConfigService],
        },
        JobsClientService,
      ],
      exports: [JobsClientService],
    };
  }
}
