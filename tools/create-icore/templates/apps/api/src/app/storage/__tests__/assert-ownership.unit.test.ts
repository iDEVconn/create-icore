import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { assertOwnership } from '../assert-ownership';

describe('assertOwnership', () => {
  it('passes when the path starts with userId/', () => {
    expect(() => assertOwnership({ bucket: 'b', path: 'user-1/foo.txt' }, 'user-1')).not.toThrow();
  });

  it('throws ForbiddenException on a foreign prefix', () => {
    expect(() => assertOwnership({ bucket: 'b', path: 'attacker/foo.txt' }, 'user-1')).toThrow(
      ForbiddenException,
    );
  });

  it('throws when path has no prefix at all', () => {
    expect(() => assertOwnership({ bucket: 'b', path: 'foo.txt' }, 'user-1')).toThrow(
      ForbiddenException,
    );
  });

  it('treats userId-substring-but-not-prefix as foreign', () => {
    // "user-12/x" must NOT match "user-1" — prefix must terminate at `/`
    expect(() => assertOwnership({ bucket: 'b', path: 'user-12/x' }, 'user-1')).toThrow(
      ForbiddenException,
    );
  });
});
