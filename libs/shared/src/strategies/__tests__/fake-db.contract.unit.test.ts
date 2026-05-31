import { FakeDBStrategy } from '../fakes/fake-db';
import { runDBContract } from './db.contract.unit.test';

runDBContract('FakeDBStrategy', () => new FakeDBStrategy());
