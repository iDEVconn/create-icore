import { Module } from '@nestjs/common';
import { AUTH_CLIENT, AuthClientService } from '../../../../libs/auth-client/src';
import { LocalClientProxy } from './local-transport';

// The ONE substitution in the gateway slice: the real AuthClientModule.forRoot() builds a
// TCP/Redis ClientProxy from env; here the same real AuthClientService gets an in-process one.
@Module({
  providers: [{ provide: AUTH_CLIENT, useValue: new LocalClientProxy('AUTH') }, AuthClientService],
  exports: [AuthClientService],
})
export class SliceAuthClientModule {}
