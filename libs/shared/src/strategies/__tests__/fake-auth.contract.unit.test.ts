import { FakeAuthStrategy } from '../fakes/fake-auth';
import { runAuthContract } from '../contract/auth-contract';

runAuthContract('FakeAuthStrategy', () => new FakeAuthStrategy());
