import type {
  D1DatabaseLike,
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
