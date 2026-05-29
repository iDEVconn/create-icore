import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/jobs/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    WorkersModule,
  ],
})
export class AppModule {}
