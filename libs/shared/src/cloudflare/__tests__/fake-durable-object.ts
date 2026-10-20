import type { DurableObjectNamespaceLike, DurableObjectStorageLike } from '../durable-object-types';

/** In-memory DurableObjectStorage; `alarmAt` records the last scheduled alarm. */
export class FakeDurableObjectStorage implements DurableObjectStorageLike {
  readonly data = new Map<string, unknown>();
  alarmAt: number | null = null;

  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.data.set(key, structuredClone(value));
  }
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  async delete(keys: string | string[]) {
    if (typeof keys === 'string') return this.data.delete(keys);
    return keys.filter((k) => this.data.delete(k)).length;
  }
  async list<T>(options: { prefix?: string } = {}) {
    const out = new Map<string, T>();
    for (const [k, v] of this.data) if (k.startsWith(options.prefix ?? '')) out.set(k, v as T);
    return out;
  }
  async setAlarm(at: number) {
    this.alarmAt = at;
  }
}

/**
 * A namespace of objects built by `make(storage)`. Like a real Durable Object,
 * calls to one object run one at a time, and arguments/results are structurally
 * cloned (they cross an RPC boundary).
 */
export class FakeNamespace<S extends object> implements DurableObjectNamespaceLike<S> {
  readonly storages = new Map<string, FakeDurableObjectStorage>();
  private readonly objects = new Map<string, S>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly make: (storage: FakeDurableObjectStorage) => S) {}

  idFromName(name: string) {
    return name;
  }

  get(id: unknown): S {
    const name = id as string;
    let object = this.objects.get(name);
    if (!object) {
      const storage = new FakeDurableObjectStorage();
      this.storages.set(name, storage);
      object = this.make(storage);
      this.objects.set(name, object);
    }
    const target = object;
    return new Proxy(target, {
      get: (_t, prop) => {
        const fn = (target as Record<string | symbol, unknown>)[prop];
        if (typeof fn !== 'function') return fn;
        return (...args: unknown[]) => {
          const run = (this.queues.get(name) ?? Promise.resolve()).then(async () =>
            structuredClone(await fn.apply(target, structuredClone(args))),
          );
          this.queues.set(
            name,
            run.catch(() => undefined),
          );
          return run;
        };
      },
    });
  }
}
