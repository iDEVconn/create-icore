import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DBDocument, DBStrategy, QueryOptions } from '@icore/shared';
import { type SQLiteConfig, validateSqliteConfig } from './sqlite.config';

function assertValidIdentifier(name: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: "${name}"`);
  }
}

export class SqliteDBStrategy implements DBStrategy {
  private readonly db: Database.Database;
  private readonly initialized = new Set<string>();

  constructor(config: Partial<SQLiteConfig> = {}) {
    const validConfig = validateSqliteConfig(config);

    if (validConfig.databasePath !== ':memory:') {
      mkdirSync(dirname(validConfig.databasePath), { recursive: true });
    }

    this.db = new Database(validConfig.databasePath, {
      verbose: validConfig.verbose,
      timeout: validConfig.busyTimeout,
    });

    for (const [pragma, value] of Object.entries(validConfig.pragmas)) {
      if (value !== undefined) {
        this.db.pragma(`${pragma} = ${value}`);
      }
    }
  }

  private ensureTable(collection: string): void {
    assertValidIdentifier(collection);
    if (this.initialized.has(collection)) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "${collection}" (
        id   TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "${collection}_id_idx" ON "${collection}" (id);
    `);

    this.initialized.add(collection);
  }

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    this.ensureTable(collection);
    const stmt = this.db.prepare<[string], { id: string; data: string }>(
      `SELECT id, data FROM "${collection}" WHERE id = ?`,
    );
    const row = stmt.get(id);
    if (!row) return null;

    return {
      id: row.id,
      data: JSON.parse(row.data) as T,
    };
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    this.ensureTable(collection);
    const stmt = this.db.prepare(
      `INSERT INTO "${collection}" (id, data)
       VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    );
    stmt.run(id, JSON.stringify(data));
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    this.ensureTable(collection);
    const stmt = this.db.prepare(
      `UPDATE "${collection}"
       SET data = json_patch(data, ?)
       WHERE id = ?`,
    );
    const info = stmt.run(JSON.stringify(patch), id);
    if (info.changes === 0) {
      throw new Error(`not_found: ${collection}/${id}`);
    }
  }

  async delete(collection: string, id: string): Promise<void> {
    this.ensureTable(collection);
    const stmt = this.db.prepare(`DELETE FROM "${collection}" WHERE id = ?`);
    const info = stmt.run(id);
    if (info.changes === 0) {
      throw new Error(`not_found: ${collection}/${id}`);
    }
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    this.ensureTable(collection);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.where) {
      for (const c of opts.where) {
        assertValidIdentifier(c.field);
        const isId = c.field === 'id';
        const targetExpr = isId ? `id` : `json_extract(data, '$.' || '${c.field}')`;

        switch (c.op) {
          case '==':
            conditions.push(`${targetExpr} = ?`);
            params.push(c.value);
            break;
          case '!=':
            conditions.push(`${targetExpr} != ?`);
            params.push(c.value);
            break;
          case '<':
            conditions.push(`CAST(${targetExpr} AS NUMERIC) < ?`);
            params.push(Number(c.value));
            break;
          case '<=':
            conditions.push(`CAST(${targetExpr} AS NUMERIC) <= ?`);
            params.push(Number(c.value));
            break;
          case '>':
            conditions.push(`CAST(${targetExpr} AS NUMERIC) > ?`);
            params.push(Number(c.value));
            break;
          case '>=':
            conditions.push(`CAST(${targetExpr} AS NUMERIC) >= ?`);
            params.push(Number(c.value));
            break;
          case 'in': {
            const arr = Array.isArray(c.value) ? c.value : [c.value];
            if (arr.length === 0) {
              conditions.push('1 = 0');
            } else {
              const placeholders = arr.map(() => '?').join(', ');
              conditions.push(`${targetExpr} IN (${placeholders})`);
              params.push(...arr);
            }
            break;
          }
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderClause = '';
    if (opts?.orderBy) {
      assertValidIdentifier(opts.orderBy.field);
      const isId = opts.orderBy.field === 'id';
      const colExpr = isId ? 'id' : `json_extract(data, '$.' || '${opts.orderBy.field}')`;
      const dir = opts.orderBy.direction === 'desc' ? 'DESC' : 'ASC';
      orderClause = `ORDER BY ${colExpr} ${dir}`;
    }

    let limitClause = '';
    if (opts?.limit != null) {
      limitClause = `LIMIT ?`;
      params.push(opts.limit);
    }

    const query = `
      SELECT id, data FROM "${collection}"
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const stmt = this.db.prepare<unknown[], { id: string; data: string }>(query);
    const rows = stmt.all(...params);

    return rows.map((row) => ({
      id: row.id,
      data: JSON.parse(row.data) as T,
    }));
  }

  async close(): Promise<void> {
    if (this.db.open) {
      this.db.close();
    }
  }
}
