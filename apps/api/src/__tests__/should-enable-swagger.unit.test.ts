import { describe, expect, it } from 'vitest';
import { shouldEnableSwagger } from '../should-enable-swagger';

describe('shouldEnableSwagger', () => {
  it('disables Swagger in production', () => {
    expect(shouldEnableSwagger('production')).toBe(false);
  });

  it('enables Swagger in development', () => {
    expect(shouldEnableSwagger('development')).toBe(true);
  });

  it('enables Swagger when NODE_ENV is unset', () => {
    expect(shouldEnableSwagger(undefined)).toBe(true);
  });

  it('enables Swagger in test', () => {
    expect(shouldEnableSwagger('test')).toBe(true);
  });
});
