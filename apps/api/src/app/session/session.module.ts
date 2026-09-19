import { Module } from '@nestjs/common';
import { sessionStoreProvider } from './session-store.provider';

@Module({
  providers: [sessionStoreProvider],
  exports: [sessionStoreProvider],
})
export class SessionModule {}
