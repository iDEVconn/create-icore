import { FakeSessionStore } from '../fakes/fake-session-store';
import { runSessionStoreContract } from './session-store.contract';

runSessionStoreContract('FakeSessionStore', () => new FakeSessionStore());
