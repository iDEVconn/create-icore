/**
 * Nest injection tokens the Worker host provides from its bindings (`env.SESSIONS`,
 * `env.THROTTLE`). They live here so the gateway can consume them without importing
 * the Worker app.
 */
export const SESSION_DO_NAMESPACE = 'SESSION_DO_NAMESPACE';
export const THROTTLER_DO_NAMESPACE = 'THROTTLER_DO_NAMESPACE';

/** Injection token for a Cloudflare Workers D1 binding (`env.DB`); consumed by `@icore/db-d1`. */
export const D1_DATABASE_BINDING = 'D1_DATABASE_BINDING';

/**
 * Minimal structural view of the Workers `D1Database` binding, so neither this lib nor the D1
 * strategy needs `@cloudflare/workers-types`, and both stay loadable in Node.
 */
export interface D1DatabaseLike {
  prepare(sql: string): {
    bind(...params: (string | number | null)[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta: { changes?: number } }>;
    };
  };
}
