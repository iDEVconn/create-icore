import { describe, expect, it } from 'vitest';
import { EmailConfirmationRequiredError } from '../auth';
import { FakeAuthStrategy } from '../fakes/fake-auth';

describe('FakeAuthStrategy — email confirmation', () => {
  it('returns a session when confirmation is not required (default)', async () => {
    const s = new FakeAuthStrategy();
    const session = await s.signUp('a@x.com', 'pw12345!');
    expect(session.user.email).toBe('a@x.com');
  });

  it('signUp throws EmailConfirmationRequiredError carrying the new user', async () => {
    const s = new FakeAuthStrategy();
    s.requireEmailConfirmation = true;
    const err = await s.signUp('b@x.com', 'pw12345!').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailConfirmationRequiredError);
    const user = (err as EmailConfirmationRequiredError).user;
    expect(user.email).toBe('b@x.com');
    expect(user.id).toBeTruthy();
  });

  it('signIn rejects with email_not_confirmed until confirmEmail()', async () => {
    const s = new FakeAuthStrategy();
    s.requireEmailConfirmation = true;
    await s.signUp('c@x.com', 'pw12345!').catch(() => undefined);
    await expect(s.signIn('c@x.com', 'pw12345!')).rejects.toThrow('email_not_confirmed');
    s.confirmEmail('c@x.com');
    const session = await s.signIn('c@x.com', 'pw12345!');
    expect(session.user.email).toBe('c@x.com');
  });
});
