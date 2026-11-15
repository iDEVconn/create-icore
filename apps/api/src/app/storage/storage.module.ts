import { Module } from '@nestjs/common';
import { UploadClientModule } from '@icore/upload-client';
import { STORAGE_REST_CONTROLLERS } from './storage.controllers';

@Module({
  imports: [UploadClientModule.forRoot()],
  controllers: STORAGE_REST_CONTROLLERS,
  exports: [UploadClientModule],
})
export class StorageModule {}
