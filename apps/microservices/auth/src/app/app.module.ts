import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthProviderModule } from './auth.provider';
import { HmacAuthGuard } from './security/hmac.guard';

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
  providers: [{ provide: APP_GUARD, useClass: HmacAuthGuard }],
})
export class AppModule {}
