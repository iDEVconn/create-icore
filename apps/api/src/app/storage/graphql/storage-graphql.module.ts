import { Module } from '@nestjs/common';
import { UploadClientModule } from '@icore/upload-client';
import { StorageResolver } from './storage.resolver';

@Module({
  imports: [UploadClientModule.forRoot()],
  providers: [StorageResolver],
  exports: [UploadClientModule],
})
export class StorageGraphqlModule {}
