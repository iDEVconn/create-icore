import { describe, expect, it } from 'vitest';
import { authEmailNotice } from '../auth-email-notice.js';

describe('authEmailNotice', () => {
  it('tells Supabase users to set Site URL + Redirect URLs (emails default to localhost:3000)', () => {
    const text = authEmailNotice('supabase').join('\n');
    expect(text).toContain('Authentication → URL Configuration');
    expect(text).toContain('Site URL');
    expect(text).toContain('localhost:3000');
    expect(text).toContain('/auth/callback');
  });

  it('tells Firebase users to authorize their client domain', () => {
    expect(authEmailNotice('firebase').join('\n')).toContain('Authorized domains');
  });

  it.each(['none', 'postgres', 'mongodb'] as const)(
    'is empty for %s (no provider-sent emails)',
    (p) => {
      expect(authEmailNotice(p)).toEqual([]);
    },
  );
});
