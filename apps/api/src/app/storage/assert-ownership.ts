import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { StorageRef } from '@icore/shared';

// eslint-disable-next-line no-control-regex
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

const MAX_DECODE_PASSES = 4;

/**
 * Leniently decodes each well-formed `%XX` escape on its own (a malformed escape elsewhere in the
 * string must not stop the rest from being decoded, as a lenient server would), repeating while the
 * string changes. Returns every form seen; null when it never settles (deeply nested encoding).
 */
function decodedForms(segment: string): string[] | null {
  const forms = [segment];
  let current = segment;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    const next = current.replace(/%([0-9a-f]{2})/gi, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    if (next === current) return forms;
    forms.push(next);
    current = next;
  }
  return null;
}

/**
 * True when every `/`-separated segment is a real name: no `.`/`..` (directory traversal),
 * no empty segment (`a//b`), no backslash (Windows-style separator) or control character.
 * Percent-encoded forms count too (`%2e%2e`, `..%2f`, double-encoded): a storage SDK or server
 * may decode the key before resolving it, so a segment is rejected when any decoded form
 * contains a `.`/`..` piece, a backslash or a control character. Dots inside a name
 * (`my..file.txt`) and a literal `%` are fine.
 */
function hasOnlyPlainSegments(path: string): boolean {
  if (CONTROL_OR_BACKSLASH.test(path)) return false;
  return path.split('/').every((segment) => {
    if (segment === '' || segment === '.' || segment === '..') return false;
    const forms = decodedForms(segment);
    if (!forms) return false;
    return forms.every(
      (form) =>
        !CONTROL_OR_BACKSLASH.test(form) &&
        form.split('/').every((piece) => piece !== '.' && piece !== '..'),
    );
  });
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
