import { Module } from '@nestjs/common';
import { EmailWorker } from './email.worker';
import { ImageProcessWorker } from './image-process.worker';
import { CleanupWorker } from './cleanup.worker';

@Module({
  providers: [EmailWorker, ImageProcessWorker, CleanupWorker],
})
export class WorkersModule {}
