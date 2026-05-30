import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { AuthClientService } from './auth-client.service';

import { AUTH_CLIENT } from './auth-client.tokens';

@Module({})
export class AuthClientModule {
  static forRoot(): DynamicModule {
    return {
      module: AuthClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: AUTH_CLIENT,
            useFactory: () => buildTransport('AUTH'),
          },
        ]),
      ],
      providers: [AuthClientService],
      exports: [AuthClientService],
    };
  }
}
