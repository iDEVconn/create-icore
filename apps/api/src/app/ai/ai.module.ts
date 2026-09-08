import { Module } from '@nestjs/common';
import { AiUsageModule, AdminAiUsageController } from '@idevconn/ai-usage/server';
import { AiClientModule, AiClientService } from '@icore/ai-client';
import { CheckAbility } from '../abilities/check-ability.decorator';
import { AiController } from './ai.controller';
import { GatewayAiUsageDataSource } from './gateway-ai-usage-data-source';

// AiUsageModule.forRoot() registers AdminAiUsageController itself (its
// controllers array isn't configurable), so a global AbilityGuard needs its
// metadata applied imperatively rather than via a @CheckAbility() on a
// subclass — see @idevconn/ai-usage's README.
CheckAbility('read', 'AiUsage')(AdminAiUsageController);

@Module({
  imports: [
    AiClientModule.forRoot(),
    AiUsageModule.forRoot({
      imports: [AiClientModule.forRoot()],
      inject: [AiClientService],
      useFactory: (ai: AiClientService) => new GatewayAiUsageDataSource(ai),
    }),
  ],
  controllers: [AiController],
})
export class AiModule {}
