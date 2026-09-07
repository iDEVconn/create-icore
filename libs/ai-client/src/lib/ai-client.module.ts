import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { AiClientService } from './ai-client.service';

import { AI_CLIENT } from './ai-client.tokens';

@Module({})
export class AiClientModule {
  static forRoot(): DynamicModule {
    return {
      module: AiClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: AI_CLIENT,
            useFactory: () => buildTransport('AI'),
          },
        ]),
      ],
      providers: [AiClientService],
      exports: [AiClientService],
    };
  }
}
