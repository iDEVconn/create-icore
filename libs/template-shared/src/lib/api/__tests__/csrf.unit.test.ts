// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readCsrfCookie } from '../csrf';

describe('readCsrfCookie', () => {
  afterEach(() => {
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  it('returns null when the cookie is not present', () => {
    expect(readCsrfCookie()).toBeNull();
  });

  it('reads the value when present among other cookies', () => {
    document.cookie = 'other=1';
    document.cookie = 'icore_csrf=abc123';
    expect(readCsrfCookie()).toBe('abc123');
  });
});
