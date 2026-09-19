import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthClientModule } from '@icore/auth-client';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [AuthClientModule.forRoot(), SessionModule],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthClientModule],
})
export class AuthModule {}
