import { FakeAuthStrategy } from '../fakes/fake-auth';
import { runAuthContract } from './auth.contract.unit.test';

runAuthContract('FakeAuthStrategy', () => new FakeAuthStrategy(), {
  getMagicLinkToken: (strategy, email) =>
    (strategy as FakeAuthStrategy).getLastMagicLinkToken(email),
  getOAuthCode: (strategy, provider, email) =>
    (strategy as FakeAuthStrategy).getLastOAuthChallenge(provider, email),
});
