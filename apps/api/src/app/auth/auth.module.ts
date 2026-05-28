import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthClientModule } from '@icore/auth-client';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [AuthClientModule.forRoot()],
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthClientModule],
})
export class AuthModule {}
