import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthProviderModule } from './auth.provider';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/auth/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    AuthProviderModule,
  ],
  controllers: [AuthController],
})
export class AppModule {}
