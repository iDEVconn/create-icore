import { D1_DATABASE_BINDING, type D1DatabaseLike } from '@icore/shared';
import type { D1ClientLike, D1Param } from './d1-client';

// The token and the structural binding type live in @icore/shared so the Worker host can name them
// without depending on this strategy lib (a project may ship no D1 at all).
export { D1_DATABASE_BINDING, type D1DatabaseLike };

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
