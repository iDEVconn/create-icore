import type { D1ClientLike, D1Param } from './d1-client';

/** Injection token for a Cloudflare Workers D1 binding (`env.DB`). */
export const D1_DATABASE_BINDING = 'D1_DATABASE_BINDING';

/**
 * Minimal structural view of the Workers `D1Database` binding, so this lib needs
 * no `@cloudflare/workers-types` dependency and stays loadable in Node.
 */
export interface D1DatabaseLike {
  prepare(sql: string): {
    bind(...params: D1Param[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta: { changes?: number } }>;
    };
  };
}

/** `D1ClientLike` over a Workers D1 binding: no HTTPS hop, no REST rate limit. */
export function createD1BindingClient(db: D1DatabaseLike): D1ClientLike {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: D1Param[] = []) {
      const { results, meta } = await db
        .prepare(sql)
        .bind(...params)
        .all<T>();
      return { rows: results, changes: meta.changes ?? 0 };
    },
  };
}
