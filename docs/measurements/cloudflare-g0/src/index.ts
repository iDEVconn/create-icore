import 'reflect-metadata';
// @ts-ignore - provided by the workerd runtime
import { httpServerHandler } from 'cloudflare:node';
import { PORT, bootstrap } from './bootstrap';

export { ProbeDurableObject } from './probe-do';

const handler = httpServerHandler({ port: PORT });

// Bootstrap lazily on the first request (memoized) so global scope stays cheap and inside
// the 1 s startup limit; the cost of the first request is what G0 measures.
let ready: Promise<void> | undefined;

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    console.log('g0: fetch start');
    if (new URL(request.url).pathname === '/__g0/diag') {
      // Answered before bootstrap so it works even when bootstrap fails.
      return Response.json({
        processEnvNodeEnv: process.env['NODE_ENV'] ?? null,
        processEnvProbe: process.env['G0_PROBE'] ?? null,
        bindingNodeEnv: (env as Record<string, unknown>)['NODE_ENV'] ?? null,
        bindingKeys: Object.keys(env as object).sort(),
      });
    }
    // A failed or cancelled bootstrap must not stay memoized: a promise started by a request
    // that was cancelled never settles, and every later request would wait on it forever.
    ready ??= bootstrap().catch((err) => {
      ready = undefined;
      console.log('g0: bootstrap failed', err instanceof Error ? err.message : String(err));
      throw err;
    });
    await ready;
    console.log('g0: ready, delegating to node http handler');
    const res = await handler.fetch(request, env, ctx);
    console.log('g0: handler returned', res.status);
    return res;
  },
};
