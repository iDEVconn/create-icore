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
    await (ready ??= bootstrap());
    return handler.fetch(request, env, ctx);
  },
};
