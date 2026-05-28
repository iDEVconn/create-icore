import { ForbiddenException } from '@nestjs/common';
import type { StorageRef } from '@icore/shared';

export function assertOwnership(ref: StorageRef, userId: string): void {
  if (!ref.path.startsWith(`${userId}/`)) {
    throw new ForbiddenException('foreign_storage_ref');
  }
}
