import { resolveResetToken } from './reset-token';

/**
 * What a landing on `/reset-password` actually is. Firebase has ONE
 * project-wide "action URL" for every email action, so besides password reset
 * it can deliver the magic link (`mode=signIn`) and verify/recover-email
 * actions to this page.
 */
export type EmailAction =
  | { kind: 'reset'; token: string }
  | { kind: 'signIn'; search: string }
  | { kind: 'ignore' }
  | { kind: 'none' };

export function resolveEmailAction(params: URLSearchParams): EmailAction {
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  if (mode === 'signIn' && oobCode) {
    // The magic-link callback wants `oobCode` + `email`; the email travels inside continueUrl.
    const out = new URLSearchParams({ oobCode });
    try {
      const email = new URL(params.get('continueUrl') ?? '').searchParams.get('email');
      if (email) out.set('email', email);
    } catch {
      // no / invalid continueUrl: hand over the code alone
    }
    return { kind: 'signIn', search: out.toString() };
  }
  if (mode && mode !== 'resetPassword') return { kind: 'ignore' };
  const token = resolveResetToken(params);
  return token ? { kind: 'reset', token } : { kind: 'none' };
}
