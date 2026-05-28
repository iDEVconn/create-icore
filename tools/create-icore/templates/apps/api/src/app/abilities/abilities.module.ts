import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AbilityFactory } from './ability.factory';
import { AbilityGuard } from './ability.guard';

@Module({
  providers: [AbilityFactory, { provide: APP_GUARD, useClass: AbilityGuard }],
  exports: [AbilityFactory],
})
export class AbilitiesModule {}
