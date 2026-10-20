import { createRequire } from 'node:module';
import type { D1ClientLike, D1Param, D1QueryResult } from '../d1-client';

// Test-only helper: loaded through createRequire so Vite never tries to
// resolve the `node:sqlite` builtin (Node 24+).
const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');

const READ_STATEMENT = /^\s*(SELECT|PRAGMA|WITH)\b/i;

/**
 * In-memory SQLite stand-in for the D1 REST client. With `stringifyParams`
 * every non-null bound param is sent as a string, mimicking the REST worst case.
 */
export function createSqliteD1Client(opts: { stringifyParams?: boolean } = {}): D1ClientLike {
  const db = new DatabaseSync(':memory:');
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: D1Param[] = [],
    ): Promise<D1QueryResult<T>> {
      const bound = params.map((p) => (p !== null && opts.stringifyParams ? String(p) : p));
      const stmt = db.prepare(sql);
      if (READ_STATEMENT.test(sql)) {
        return { rows: stmt.all(...bound) as T[], changes: 0 };
      }
      const info = stmt.run(...bound);
      return { rows: [], changes: Number(info.changes) };
    },
  };
}
