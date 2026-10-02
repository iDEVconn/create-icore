import type { CreateIcoreOptions } from './options.js';

/**
 * Provider-side setup the generated project cannot do for you. Without it,
 * confirmation / magic-link emails link to the provider's default URL
 * (Supabase: http://localhost:3000) instead of your client.
 */
export function authEmailNotice(authProvider: CreateIcoreOptions['authProvider']): string[] {
  if (authProvider === 'supabase') {
    return [
      'Supabase email links: open your project → Authentication → URL Configuration and set',
      '  • Site URL = your client URL (CLIENT_ORIGIN in apps/api/.env). The default is http://localhost:3000,',
      '    so confirmation emails would otherwise point there.',
      '  • Redirect URLs = <CLIENT_ORIGIN>/auth/callback',
      'Details: docs/runbooks/auth-email-setup.md',
    ];
  }
  if (authProvider === 'firebase') {
    return [
      'Firebase email links: Authentication → Settings → Authorized domains — add your client domain.',
      'Details: docs/runbooks/auth-email-setup.md',
    ];
  }
  return [];
}
