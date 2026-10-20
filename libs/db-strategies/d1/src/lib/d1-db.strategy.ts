import type { DBDocument, DBStrategy, QueryOptions, WhereClause } from '@icore/shared';
import type { D1ClientLike, D1Param } from './d1-client';

export const D1_MAX_BOUND_PARAMS = 100;

function assertValidIdentifier(name: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: "${name}"`);
  }
}

function isNumeric(v: unknown): v is number | boolean {
  return typeof v === 'number' || typeof v === 'boolean';
}

function toParam(v: unknown): D1Param {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  return JSON.stringify(v);
}

function fieldExpr(field: string): string {
  assertValidIdentifier(field);
  return field === 'id' ? 'id' : `json_extract(data, '$.${field}')`;
}

/** Turns one WhereClause into a SQL fragment plus its bound params. */
function whereToSql(c: WhereClause): { sql: string; params: D1Param[] } {
  const expr = fieldExpr(c.field);
  const isId = c.field === 'id';

  switch (c.op) {
    case '<':
    case '<=':
    case '>':
    case '>=':
      return { sql: `CAST(${expr} AS NUMERIC) ${c.op} ?`, params: [Number(c.value)] };
    case '==':
    case '!=': {
      if (!isId && isNumeric(c.value)) {
        return {
          sql: `CAST(${expr} AS NUMERIC) ${c.op} CAST(? AS NUMERIC)`,
          params: [toParam(c.value)],
        };
      }
      return { sql: `${expr} ${c.op} ?`, params: [toParam(c.value)] };
    }
    case 'in': {
      const arr = Array.isArray(c.value) ? c.value : [c.value];
      if (arr.length === 0) return { sql: '1 = 0', params: [] };
      if (!isId && arr.every(isNumeric)) {
        const ph = arr.map(() => 'CAST(? AS NUMERIC)').join(', ');
        return { sql: `CAST(${expr} AS NUMERIC) IN (${ph})`, params: arr.map(toParam) };
      }
      const ph = arr.map((v) => (!isId && isNumeric(v) ? 'CAST(? AS NUMERIC)' : '?')).join(', ');
      return { sql: `${expr} IN (${ph})`, params: arr.map(toParam) };
    }
  }
}

export class D1DBStrategy implements DBStrategy {
  private readonly initialized = new Map<string, Promise<void>>();

  constructor(private readonly client: D1ClientLike) {}

  private run(sql: string, params: D1Param[] = []) {
    if (params.length > D1_MAX_BOUND_PARAMS) {
      throw new Error(
        `too_many_params: ${params.length} bound params exceeds the D1 limit of ${D1_MAX_BOUND_PARAMS}`,
      );
    }
    return this.client.query<{ id: string; data: string }>(sql, params);
  }

  private ensureTable(collection: string): Promise<void> {
    assertValidIdentifier(collection);
    let pending = this.initialized.get(collection);
    if (!pending) {
      pending = (async () => {
        await this.client.query(
          `CREATE TABLE IF NOT EXISTS "${collection}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
        );
        await this.client.query(
          `CREATE INDEX IF NOT EXISTS "${collection}_id_idx" ON "${collection}" (id)`,
        );
      })();
      this.initialized.set(collection, pending);
      // Do not memoize a failed init, so a later call can retry.
      pending.catch(() => this.initialized.delete(collection));
    }
    return pending;
  }

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    await this.ensureTable(collection);
    const { rows } = await this.run(`SELECT id, data FROM "${collection}" WHERE id = ?`, [id]);
    const row = rows[0];
    return row ? { id: row.id, data: JSON.parse(row.data) as T } : null;
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    await this.ensureTable(collection);
    await this.run(
      `INSERT INTO "${collection}" (id, data) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [id, JSON.stringify(data)],
    );
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    await this.ensureTable(collection);
    const { changes } = await this.run(
      `UPDATE "${collection}" SET data = json_patch(data, ?) WHERE id = ?`,
      [JSON.stringify(patch), id],
    );
    if (changes === 0) throw new Error(`not_found: ${collection}/${id}`);
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.ensureTable(collection);
    const { changes } = await this.run(`DELETE FROM "${collection}" WHERE id = ?`, [id]);
    if (changes === 0) throw new Error(`not_found: ${collection}/${id}`);
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    assertValidIdentifier(collection);

    const conditions: string[] = [];
    const params: D1Param[] = [];
    for (const c of opts?.where ?? []) {
      const w = whereToSql(c);
      conditions.push(w.sql);
      params.push(...w.params);
    }

    let orderClause = '';
    if (opts?.orderBy) {
      const dir = opts.orderBy.direction === 'desc' ? 'DESC' : 'ASC';
      orderClause = `ORDER BY ${fieldExpr(opts.orderBy.field)} ${dir}`;
    }

    let limitClause = '';
    if (opts?.limit != null) {
      if (!Number.isInteger(opts.limit) || opts.limit < 0) {
        throw new Error(`Invalid limit: ${String(opts.limit)} (must be a non-negative integer)`);
      }
      limitClause = `LIMIT ${opts.limit}`;
    }

    if (params.length > D1_MAX_BOUND_PARAMS) {
      throw new Error(
        `too_many_params: ${params.length} bound params exceeds the D1 limit of ${D1_MAX_BOUND_PARAMS}`,
      );
    }

    await this.ensureTable(collection);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.run(
      `SELECT id, data FROM "${collection}" ${where} ${orderClause} ${limitClause}`,
      params,
    );
    return rows.map((row) => ({ id: row.id, data: JSON.parse(row.data) as T }));
  }
}
