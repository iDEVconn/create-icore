import { FakeAuthStrategy } from '@icore/shared';
import { runAuthContract } from '@icore/shared/testing';

runAuthContract('FakeAuthStrategy', () => new FakeAuthStrategy(), {
  getMagicLinkToken: (strategy, email) =>
    (strategy as FakeAuthStrategy).getLastMagicLinkToken(email),
  getPasswordResetToken: (strategy, email) =>
    (strategy as FakeAuthStrategy).getLastPasswordResetToken(email),
  getOAuthCode: (strategy, provider, email) =>
    (strategy as FakeAuthStrategy).getLastOAuthChallenge(provider, email),
});
