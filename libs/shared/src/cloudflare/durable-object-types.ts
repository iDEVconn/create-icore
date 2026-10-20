/**
 * Structural views of the Cloudflare Durable Object APIs these stores need, so
 * `libs/shared` stays loadable in Node and needs no `@cloudflare/workers-types`.
 * The Worker host (apps/worker) passes the real `DurableObjectNamespace` /
 * `DurableObjectStorage`, which satisfy these shapes.
 */
export interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  /** Deletes one key (resolving whether it existed) or many keys (resolving how many existed). */
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
  setAlarm(scheduledTime: number): Promise<void>;
}

/** A Durable Object namespace whose stubs expose `S`'s methods over RPC. */
export interface DurableObjectNamespaceLike<S> {
  idFromName(name: string): unknown;
  get(id: unknown): S;
}
