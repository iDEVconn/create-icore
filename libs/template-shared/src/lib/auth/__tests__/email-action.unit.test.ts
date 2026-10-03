import { describe, expect, it } from 'vitest';
import { resolveEmailAction } from '../email-action';

describe('resolveEmailAction', () => {
  it('Supabase recovery link (token_hash) → reset', () => {
    expect(resolveEmailAction(new URLSearchParams('token_hash=abc&type=recovery'))).toEqual({
      kind: 'reset',
      token: 'abc',
    });
  });

  it('Firebase resetPassword action → reset with the oobCode', () => {
    expect(resolveEmailAction(new URLSearchParams('mode=resetPassword&oobCode=xyz'))).toEqual({
      kind: 'reset',
      token: 'xyz',
    });
  });

  it('Firebase signIn action (magic link sent through the same project-wide action URL) → hand over to /auth/callback with the email from continueUrl', () => {
    const continueUrl = encodeURIComponent('https://my.app/auth/callback?email=a%40x.com');
    const action = resolveEmailAction(
      new URLSearchParams(`mode=signIn&oobCode=c1&continueUrl=${continueUrl}&lang=en`),
    );
    expect(action).toEqual({ kind: 'signIn', search: 'oobCode=c1&email=a%40x.com' });
  });

  it('Firebase signIn without a usable continueUrl still hands over the oobCode', () => {
    expect(resolveEmailAction(new URLSearchParams('mode=signIn&oobCode=c1'))).toEqual({
      kind: 'signIn',
      search: 'oobCode=c1',
    });
  });

  it.each(['verifyEmail', 'recoverEmail'])('other Firebase action %s → ignore', (mode) => {
    expect(resolveEmailAction(new URLSearchParams(`mode=${mode}&oobCode=z`))).toEqual({
      kind: 'ignore',
    });
  });

  it('nothing recognisable → none', () => {
    expect(resolveEmailAction(new URLSearchParams('foo=bar'))).toEqual({ kind: 'none' });
  });
});
