import { Module } from '@nestjs/common';
import { UploadClientModule } from '@icore/upload-client';
import { StorageController } from './storage.controller';

@Module({
  imports: [UploadClientModule.forRoot()],
  controllers: [StorageController],
  exports: [UploadClientModule],
})
export class StorageModule {}
