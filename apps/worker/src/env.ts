import type { D1DatabaseLike } from '@icore/db-d1';
import type {
  DurableObjectNamespaceLike,
  SessionObjectStub,
  ThrottleObjectStub,
} from '@icore/shared';

/** The bindings declared in `wrangler.jsonc` (plus plain-text vars and secrets, which are strings). */
export interface WorkerEnv {
  SESSIONS: DurableObjectNamespaceLike<SessionObjectStub>;
  THROTTLE: DurableObjectNamespaceLike<ThrottleObjectStub>;
  DB?: D1DatabaseLike;
}
