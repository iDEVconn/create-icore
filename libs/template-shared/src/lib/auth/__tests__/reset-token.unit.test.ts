import { describe, expect, it } from 'vitest';
import { resolveResetToken } from '../reset-token';

describe('resolveResetToken', () => {
  it('reads Supabase token_hash', () => {
    expect(resolveResetToken(new URLSearchParams('token_hash=abc&type=recovery'))).toBe('abc');
  });
  it('reads a generic token param first', () => {
    expect(resolveResetToken(new URLSearchParams('token=t1&token_hash=t2'))).toBe('t1');
  });
  it('reads Firebase oobCode', () => {
    expect(resolveResetToken(new URLSearchParams('mode=resetPassword&oobCode=xyz'))).toBe('xyz');
  });
  it('returns null when none is present', () => {
    expect(resolveResetToken(new URLSearchParams('foo=bar'))).toBeNull();
  });
});
