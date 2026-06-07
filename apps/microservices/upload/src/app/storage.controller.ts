import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { StorageRef, StorageStrategy } from '@icore/shared';

interface UploadPayload {
  userId: string;
  file: { buffer: string; filename: string; mimeType: string };
}

interface RefPayload {
  userId: string;
  ref: StorageRef;
}

interface SignedUrlPayload extends RefPayload {
  ttlSec?: number;
}

interface ListPayload {
  userId: string;
  prefix?: string;
}

@Controller()
export class StorageController {
  constructor(@Inject('StorageStrategy') private readonly strategy: StorageStrategy) {}

  @MessagePattern('storage.upload')
  upload(@Payload() payload: UploadPayload): Promise<StorageRef> {
    return this.strategy.upload(payload.userId, {
      buffer: Buffer.from(payload.file.buffer, 'base64'),
      filename: payload.file.filename,
      mimeType: payload.file.mimeType,
    });
  }

  @MessagePattern('storage.remove')
  remove(@Payload() payload: RefPayload): Promise<void> {
    return this.strategy.remove(payload.userId, payload.ref);
  }

  @MessagePattern('storage.signedUrl')
  signedUrl(@Payload() payload: SignedUrlPayload): Promise<string> {
    return this.strategy.getSignedUrl(payload.userId, payload.ref, payload.ttlSec);
  }

  @MessagePattern('storage.list')
  list(@Payload() payload: ListPayload): Promise<StorageRef[]> {
    return this.strategy.list(payload.userId, payload.prefix);
  }

  @MessagePattern('storage.downloadBuffer')
  async downloadBuffer(@Payload() payload: RefPayload): Promise<string | null> {
    if (!this.strategy.downloadBuffer) return null;
    const buf = await this.strategy.downloadBuffer(payload.userId, payload.ref);
    return buf.toString('base64');
  }
}
