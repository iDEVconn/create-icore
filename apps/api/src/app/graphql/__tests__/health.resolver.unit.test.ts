import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY as FROM_AUTH, Public as PublicFromAuth } from '../../auth/public.decorator';
import { IS_PUBLIC_KEY, Public } from '../../http/public.decorator';
import { SKIP_CSRF_KEY } from '../../http/skip-csrf.decorator';
import { HealthResolver } from '../health.resolver';

describe('HealthResolver', () => {
  it('reports ok', () => {
    expect(new HealthResolver().health()).toEqual({ status: 'ok' });
  });

  it('is public and CSRF-exempt (both flags, set separately)', () => {
    const handler = HealthResolver.prototype.health;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(SKIP_CSRF_KEY, handler)).toBe(true);
  });
});

describe('Public decorator location', () => {
  it('auth/public.decorator re-exports the http/ one', () => {
    expect(PublicFromAuth).toBe(Public);
    expect(FROM_AUTH).toBe(IS_PUBLIC_KEY);
  });
});
