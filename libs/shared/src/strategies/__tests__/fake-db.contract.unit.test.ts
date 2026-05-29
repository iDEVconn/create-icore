import { FakeDBStrategy } from '../fakes/fake-db';
import { runDBContract } from '../contract/db-contract';

runDBContract('FakeDBStrategy', () => new FakeDBStrategy());
