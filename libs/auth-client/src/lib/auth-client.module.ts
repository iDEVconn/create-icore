import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { AuthClientService } from './auth-client.service';

import { AUTH_CLIENT } from './auth-client.tokens';

// One DynamicModule object for the whole process: Nest dedupes a dynamic module by identity of its
// metadata, and the registerAsync factory below is a fresh function per call, so every extra
// forRoot() (AuthModule, the profile REST and GraphQL surfaces) would open its own TCP client.
let shared: DynamicModule | undefined;

@Module({})
export class AuthClientModule {
  static forRoot(): DynamicModule {
    shared ??= {
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
    return shared;
  }
}
