import { FakeStorageStrategy } from '../fakes/fake-storage';
import { runStorageContract } from './storage.contract.unit.test';

runStorageContract('FakeStorageStrategy', () => new FakeStorageStrategy());
