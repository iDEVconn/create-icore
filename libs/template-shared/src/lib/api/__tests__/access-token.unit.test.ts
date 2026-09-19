import { beforeEach, describe, expect, it } from 'vitest';
import { getAccessToken, setAccessToken } from '../access-token';

describe('access-token', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it('starts as null', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('returns whatever was last set', () => {
    setAccessToken('token-1');
    expect(getAccessToken()).toBe('token-1');
    setAccessToken('token-2');
    expect(getAccessToken()).toBe('token-2');
  });

  it('can be cleared back to null', () => {
    setAccessToken('token-1');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});
