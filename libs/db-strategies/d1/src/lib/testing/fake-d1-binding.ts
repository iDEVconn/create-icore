import type { D1DatabaseLike } from '../d1-binding-client';
import { createSqliteD1Client } from './sqlite-d1-client';

/**
 * A `D1Database`-shaped fake backed by node:sqlite, mirroring the Workers
 * binding surface (`prepare(sql).bind(...params).all()`).
 */
export function createFakeD1Binding(): D1DatabaseLike & {
  calls: { sql: string; params: unknown[] }[];
} {
  const client = createSqliteD1Client();
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params });
          return {
            async all<T>() {
              const { rows, changes } = await client.query<T>(sql, params as never[]);
              return { results: rows, meta: { changes } };
            },
          };
        },
      };
    },
  };
}
