import 'reflect-metadata';
import { httpServerHandler } from 'cloudflare:node';
import { PORT, bootstrap } from './bootstrap';
import type { WorkerEnv } from './env';

export { SessionDurableObject, ThrottleDurableObject } from './durable-objects';

const handler = httpServerHandler({ port: PORT });

// Bootstrap lazily on the first request (memoized): global scope stays inside the 1 s startup
// limit, and the first request pays for the bootstrap. A failed or canceled bootstrap must not
// stay memoized, or every later request would wait on a promise that never settles.
let ready: Promise<void> | undefined;

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: unknown): Promise<Response> {
    ready ??= bootstrap(env).catch((err) => {
      ready = undefined;
      console.error('worker bootstrap failed', err instanceof Error ? err.message : String(err));
      throw err;
    });
    await ready;
    return handler.fetch(request, env, ctx);
  },
};
