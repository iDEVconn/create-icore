import { FakeDBStrategy } from '@icore/shared';
import { runDBContract } from '@icore/shared/testing';

runDBContract('FakeDBStrategy', () => new FakeDBStrategy());
