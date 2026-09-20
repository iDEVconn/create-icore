import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthClientModule } from '@icore/auth-client';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { SessionModule } from '../session/session.module';
import { CsrfGuard } from '../http/csrf.guard';

@Module({
  imports: [AuthClientModule.forRoot(), SessionModule],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AuthClientModule],
})
export class AuthModule {}
