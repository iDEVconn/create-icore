import type { DurableObjectNamespaceLike } from './durable-object-types';
import type { ThrottleObjectStub, ThrottleRecord } from './throttle-object-core';

/**
 * `@nestjs/throttler` storage (structurally: `ThrottlerStorage`) that keeps the
 * counters in Durable Objects, so a limit holds across Worker isolates. Without
 * it the default in-memory storage is per isolate and effectively off.
 */
export class DurableObjectThrottlerStorage {
  constructor(private readonly namespace: DurableObjectNamespaceLike<ThrottleObjectStub>) {}

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottleRecord> {
    const stub = this.namespace.get(this.namespace.idFromName(`${throttlerName}:${key}`));
    return stub.increment(ttl, limit, blockDuration);
  }
}
