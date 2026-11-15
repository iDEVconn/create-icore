import { describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { assertOwnership, assertSafeListPrefix } from '../assert-ownership';

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

describe('assertOwnership path traversal', () => {
  it.each([
    'user-1/../user-2/secret.txt',
    'user-1/./x',
    'user-1//x',
    'user-1/a/../../user-2/x',
    'user-1\\..\\user-2\\x',
    'user-1/x\u0000.txt',
    'user-1/%2e%2e/user-2/x',
    'user-1/%2E%2E/user-2/x',
    'user-1/..%2fuser-2/x',
    'user-1/%252e%252e/user-2/x',
    'user-1/%2e%2e%5cuser-2',
    'user-1/%00x',
    'user-1/..%2f%zz',
    'user-1/%zz%2f%2e%2e/x',
  ])('rejects %j', (path) => {
    expect(() => assertOwnership({ bucket: 'b', path }, 'user-1')).toThrow(ForbiddenException);
  });

  it('allows a literal percent and dots inside a file name', () => {
    expect(() =>
      assertOwnership({ bucket: 'b', path: 'user-1/100%25-done%20(1).txt' }, 'user-1'),
    ).not.toThrow();
  });

  it('allows dots inside a file name', () => {
    expect(() =>
      assertOwnership({ bucket: 'b', path: 'user-1/my..file.v1.2.txt' }, 'user-1'),
    ).not.toThrow();
  });
});

describe('assertSafeListPrefix', () => {
  it.each([undefined, '', 'docs', 'docs/', 'docs/2026', 'my..dir'])('accepts %j', (prefix) => {
    expect(() => assertSafeListPrefix(prefix)).not.toThrow();
  });

  it.each([
    '..',
    '../user-2',
    'a/../b',
    './x',
    '/abs',
    'a//b',
    'a\\b',
    'x\u0000',
    '%2e%2e',
    'a/%2e%2e/b',
  ])('rejects %j with 400', (prefix) => {
    expect(() => assertSafeListPrefix(prefix)).toThrow(BadRequestException);
  });
});

describe('non-string input (repeated query parameters, odd bodies)', () => {
  it.each([
    ['array path', { bucket: 'b', path: ['u1/a', 'u2/b'] }],
    ['object path', { bucket: 'b', path: { startsWith: 'u1/' } }],
    ['missing path', { bucket: 'b' }],
    ['array bucket', { bucket: ['b'], path: 'u1/a' }],
    ['number bucket', { bucket: 1, path: 'u1/a' }],
  ])('assertOwnership rejects %s with 400 invalid_storage_ref (never a TypeError)', (_l, ref) => {
    let caught: unknown;
    try {
      assertOwnership(ref as never, 'u1');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).message).toBe('invalid_storage_ref');
  });

  it('assertOwnership rejects a missing ref', () => {
    expect(() => assertOwnership(undefined as never, 'u1')).toThrow(BadRequestException);
  });

  it.each([[['a', 'b']], [{ x: 1 }], [42], [true]])(
    'assertSafeListPrefix rejects %j with 400 invalid_storage_prefix',
    (prefix) => {
      expect(() => assertSafeListPrefix(prefix)).toThrow('invalid_storage_prefix');
    },
  );

  it('assertSafeListPrefix still accepts undefined, null and the empty string', () => {
    for (const ok of [undefined, null, '']) expect(() => assertSafeListPrefix(ok)).not.toThrow();
  });
});
