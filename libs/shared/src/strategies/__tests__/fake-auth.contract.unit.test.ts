import { FakeAuthStrategy } from '../fakes/fake-auth';
import { runAuthContract } from '../contract/auth-contract';

runAuthContract('FakeAuthStrategy', () => new FakeAuthStrategy(), {
  getMagicLinkToken: (strategy, email) =>
    (strategy as FakeAuthStrategy).getLastMagicLinkToken(email),
  getOAuthCode: (strategy, provider, email) =>
    (strategy as FakeAuthStrategy).getLastOAuthChallenge(provider, email),
});
