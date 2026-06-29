import postgres from 'postgres';
import type { DBDocument, DBStrategy, QueryOptions } from '@icore/shared';

export class PostgresDBStrategy implements DBStrategy {
  private readonly sql: postgres.Sql;
  private readonly initialized = new Set<string>();

  constructor(url: string) {
    this.sql = postgres(url);
  }

  private async ensureTable(collection: string): Promise<void> {
    if (this.initialized.has(collection)) return;
    await this.sql`
      CREATE TABLE IF NOT EXISTS ${this.sql(collection)} (
        id   TEXT PRIMARY KEY,
        data JSONB NOT NULL
      )
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS ${this.sql(collection + '_data_gin')}
      ON ${this.sql(collection)} USING GIN (data)
    `;
    this.initialized.add(collection);
  }

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    await this.ensureTable(collection);
    const rows = await this.sql<{ id: string; data: T }[]>`
      SELECT id, data FROM ${this.sql(collection)} WHERE id = ${id}
    `;
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, data: row.data };
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    await this.ensureTable(collection);
    await this.sql`
      INSERT INTO ${this.sql(collection)} (id, data)
      VALUES (${id}, ${this.sql.json(data as unknown as postgres.JSONValue)})
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
    `;
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const existing = await this.get<T>(collection, id);
    if (!existing) throw new Error(`not_found: ${collection}/${id}`);
    const merged = { ...(existing.data as object), ...(patch as object) };
    await this.sql`
      UPDATE ${this.sql(collection)}
      SET data = ${this.sql.json(merged as unknown as postgres.JSONValue)}
      WHERE id = ${id}
    `;
  }

  async delete(collection: string, id: string): Promise<void> {
    const existing = await this.get(collection, id);
    if (!existing) throw new Error(`not_found: ${collection}/${id}`);
    await this.sql`DELETE FROM ${this.sql(collection)} WHERE id = ${id}`;
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    await this.ensureTable(collection);

    const conditions: postgres.Fragment[] = [];

    if (opts?.where) {
      for (const c of opts.where) {
        const field = c.field;
        if (c.op === '==' || c.op === '!=') {
          const expr = field === 'id' ? this.sql`id` : this.sql`data->>${field}`;
          conditions.push(
            c.op === '=='
              ? this.sql`${expr} = ${String(c.value)}`
              : this.sql`${expr} != ${String(c.value)}`,
          );
        } else if (c.op === 'in') {
          const vals = (c.value as unknown[]).map(String);
          const expr = field === 'id' ? this.sql`id` : this.sql`data->>${field}`;
          conditions.push(this.sql`${expr} = ANY(${vals})`);
        } else {
          // numeric ops: <, <=, >, >=
          const expr =
            field === 'id' ? this.sql`id::numeric` : this.sql`(data->>${field})::numeric`;
          const val = Number(c.value);
          if (c.op === '<') conditions.push(this.sql`${expr} < ${val}`);
          else if (c.op === '<=') conditions.push(this.sql`${expr} <= ${val}`);
          else if (c.op === '>') conditions.push(this.sql`${expr} > ${val}`);
          else if (c.op === '>=') conditions.push(this.sql`${expr} >= ${val}`);
        }
      }
    }

    const whereClause =
      conditions.length > 0
        ? this.sql`WHERE ${conditions.reduce((acc, c) => this.sql`${acc} AND ${c}`)}`
        : this.sql``;

    const orderBy = opts?.orderBy;
    const orderClause = orderBy
      ? (() => {
          const col = orderBy.field === 'id' ? this.sql`id` : this.sql`data->>${orderBy.field}`;
          const dir = orderBy.direction === 'desc' ? this.sql`DESC` : this.sql`ASC`;
          return this.sql`ORDER BY ${col} ${dir}`;
        })()
      : this.sql``;

    const limitClause = opts?.limit != null ? this.sql`LIMIT ${opts.limit}` : this.sql``;

    const rows = await this.sql<{ id: string; data: T }[]>`
      SELECT id, data FROM ${this.sql(collection)}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    return rows.map((row) => ({ id: row.id, data: row.data }));
  }

  async end(): Promise<void> {
    await this.sql.end();
  }
}
