import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { StorageRef } from '@icore/shared';

// eslint-disable-next-line no-control-regex
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/**
 * True when every `/`-separated segment is a real name: no `.`/`..` (directory traversal),
 * no empty segment (`a//b`), no backslash (Windows-style separator) or control character.
 * Dots inside a name (`my..file.txt`) are fine.
 */
function hasOnlyPlainSegments(path: string): boolean {
  if (CONTROL_OR_BACKSLASH.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * The ref must live under the caller's own folder. A bare `startsWith` is not enough:
 * `uid/../other/x` starts with `uid/` yet resolves into another user's folder in every
 * storage backend that normalises paths, so traversal segments are rejected too.
 */
export function assertOwnership(ref: StorageRef, userId: string): void {
  if (!ref.path.startsWith(`${userId}/`) || !hasOnlyPlainSegments(ref.path)) {
    throw new ForbiddenException('foreign_storage_ref');
  }
}

/**
 * `prefix` is relative to the caller's folder (strategies build `${userId}/${prefix}`), so it
 * must not climb out of it. One trailing `/` is allowed (`docs/`).
 */
export function assertSafeListPrefix(prefix: string | undefined | null): void {
  if (!prefix) return;
  const trimmed = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (trimmed === '' || !hasOnlyPlainSegments(trimmed)) {
    throw new BadRequestException('invalid_storage_prefix');
  }
}
