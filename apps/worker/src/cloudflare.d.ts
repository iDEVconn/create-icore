// Ambient declarations for the modules provided by the workerd runtime, so the
// worker needs no `@cloudflare/workers-types` dependency.
declare module 'cloudflare:workers' {
  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectState, env: Env);
    protected ctx: DurableObjectState;
    protected env: Env;
  }
  export interface DurableObjectState {
    storage: import('@icore/shared').DurableObjectStorageLike;
  }
}

declare module 'cloudflare:node' {
  export function httpServerHandler(options: { port: number }): {
    fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
  };
}
