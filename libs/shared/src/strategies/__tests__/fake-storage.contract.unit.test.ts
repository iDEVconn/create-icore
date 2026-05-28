import { FakeStorageStrategy } from '../fakes/fake-storage';
import { runStorageContract } from '../contract/storage-contract';

runStorageContract('FakeStorageStrategy', () => new FakeStorageStrategy());
