import { Module } from '@nestjs/common';
import { AiClientModule } from '@icore/ai-client';
import { AiController } from './ai.controller';

@Module({
  imports: [AiClientModule.forRoot()],
  controllers: [AiController],
})
export class AiModule {}
