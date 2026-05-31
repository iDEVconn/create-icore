import { FakeStorageStrategy } from '@icore/shared';
import { runStorageContract } from '@icore/shared/testing';

runStorageContract('FakeStorageStrategy', () => new FakeStorageStrategy());
