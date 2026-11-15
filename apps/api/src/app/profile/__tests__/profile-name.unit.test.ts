import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseProfileName, PROFILE_NAME_MAX_LENGTH } from '../profile-name';

describe('parseProfileName', () => {
  it('trims and returns a normal name', () => {
    expect(parseProfileName('  Ada Lovelace ')).toBe('Ada Lovelace');
    expect(parseProfileName('Ünï — 名前')).toBe('Ünï — 名前');
  });

  it('accepts exactly the maximum length and rejects one more', () => {
    expect(parseProfileName('a'.repeat(PROFILE_NAME_MAX_LENGTH))).toHaveLength(
      PROFILE_NAME_MAX_LENGTH,
    );
    expect(() => parseProfileName('a'.repeat(PROFILE_NAME_MAX_LENGTH + 1))).toThrow(
      BadRequestException,
    );
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['number', 42],
    ['object', { name: 'x' }],
    ['array', ['x']],
    ['empty', ''],
    ['blank', '   \t '],
    ['newline', 'a\nb'],
    ['NUL', 'a\u0000b'],
    ['escape', 'a\u001bb'],
    ['DEL', 'a\u007fb'],
    ['C1 control', 'a\u0085b'],
    ['line separator', 'a\u2028b'],
  ])('rejects %s with 400 invalid_name', (_label, raw) => {
    let caught: unknown;
    try {
      parseProfileName(raw);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).message).toBe('invalid_name');
  });
});
