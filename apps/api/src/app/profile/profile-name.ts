import { BadRequestException } from '@nestjs/common';

export const PROFILE_NAME_MAX_LENGTH = 100;

// C0/C1 controls, DEL, and the line/paragraph separators: a display name is one line of text.
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Validates and normalizes a display name from an untrusted request body / GraphQL argument:
 * a string, trimmed, 1..100 characters, no control characters. Throws 400 `invalid_name`.
 */
export function parseProfileName(raw: unknown): string {
  if (typeof raw !== 'string') throw new BadRequestException('invalid_name');
  const name = raw.trim();
  if (name.length === 0 || name.length > PROFILE_NAME_MAX_LENGTH || FORBIDDEN.test(name)) {
    throw new BadRequestException('invalid_name');
  }
  return name;
}
