import type { SupabaseClient } from '@supabase/supabase-js';

interface Row {
  id: string;
  data: Record<string, unknown>;
}

type Op = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';

interface Filter {
  path: string;
  op: Op;
  value: unknown;
}

function applyOp(val: unknown, op: Op, target: unknown): boolean {
  switch (op) {
    case 'eq':
      return String(val) === String(target);
    case 'neq':
      return String(val) !== String(target);
    case 'lt':
      return Number(val) < Number(target);
    case 'lte':
      return Number(val) <= Number(target);
    case 'gt':
      return Number(val) > Number(target);
    case 'gte':
      return Number(val) >= Number(target);
    case 'in':
      return Array.isArray(target) && (target as unknown[]).map(String).includes(String(val));
  }
}

function resolveField(row: Row, path: string): unknown {
  const field = path.startsWith('data->>') ? path.slice('data->>'.length) : path;
  if (field === 'id') return row.id;
  return row.data[field];
}

class Builder {
  private filters: Filter[] = [];
  private orderField?: string;
  private orderAsc = true;
  private limitN?: number;
  private _pendingUpdate?: Record<string, unknown>;
  private _pendingDelete = false;

  constructor(private readonly rows: Map<string, Row>) {}

  select(_cols?: string): this {
    return this;
  }

  eq(path: string, value: unknown): this {
    // If we have a pending update or delete, apply it now targeting this id
    if (this._pendingUpdate !== undefined && path === 'id') {
      const row = this.rows.get(String(value));
      if (row) {
        row.data = this._pendingUpdate;
      }
      this._pendingUpdate = undefined;
      // make this builder thenable with a resolved result
      this._terminalResult = Promise.resolve({ data: null, error: null });
      return this;
    }
    if (this._pendingDelete && path === 'id') {
      this.rows.delete(String(value));
      this._pendingDelete = false;
      this._terminalResult = Promise.resolve({ data: null, error: null });
      return this;
    }
    this.filters.push({ path, op: 'eq', value });
    return this;
  }

  neq(path: string, value: unknown): this {
    this.filters.push({ path, op: 'neq', value });
    return this;
  }

  lt(path: string, value: unknown): this {
    this.filters.push({ path, op: 'lt', value });
    return this;
  }

  lte(path: string, value: unknown): this {
    this.filters.push({ path, op: 'lte', value });
    return this;
  }

  gt(path: string, value: unknown): this {
    this.filters.push({ path, op: 'gt', value });
    return this;
  }

  gte(path: string, value: unknown): this {
    this.filters.push({ path, op: 'gte', value });
    return this;
  }

  in(path: string, value: unknown[]): this {
    this.filters.push({ path, op: 'in', value });
    return this;
  }

  order(field: string, opts?: { ascending?: boolean }): this {
    this.orderField = field;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private evaluate(): Row[] {
    let result = [...this.rows.values()];
    for (const f of this.filters) {
      result = result.filter((row) => {
        const val = resolveField(row, f.path);
        return applyOp(val, f.op, f.value);
      });
    }
    if (this.orderField) {
      const field = this.orderField;
      result.sort((a, b) => {
        const av = resolveField(a, field);
        const bv = resolveField(b, field);
        const cmp = Number(av) < Number(bv) ? -1 : Number(av) > Number(bv) ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN != null) result = result.slice(0, this.limitN);
    return result;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.evaluate()[0] ?? null, error: null };
  }

  // Tracks a pre-resolved terminal result for update/delete chains
  private _terminalResult?: Promise<{ data: null; error: null }>;

  then<R1, R2>(
    resolve?: ((v: { data: Row[] | null; error: null }) => R1) | null,
    reject?: ((e: unknown) => R2) | null,
  ): Promise<R1 | R2> {
    if (this._terminalResult) {
      return this._terminalResult.then(resolve as never, reject as never) as Promise<R1 | R2>;
    }
    try {
      const rows = this.evaluate();
      return Promise.resolve({ data: rows, error: null }).then(
        resolve as never,
        reject as never,
      ) as Promise<R1 | R2>;
    } catch (e) {
      return Promise.reject(e).then(undefined, reject) as Promise<R1 | R2>;
    }
  }

  upsert(row: Row): Promise<{ data: null; error: null }> {
    this.rows.set(row.id, { id: row.id, data: { ...row.data } });
    return Promise.resolve({ data: null, error: null });
  }

  update(patch: { data: Record<string, unknown> }): this {
    this._pendingUpdate = patch.data;
    return this;
  }

  delete(): this {
    this._pendingDelete = true;
    return this;
  }
}

export function createMockSupabaseDB(): SupabaseClient {
  const tables = new Map<string, Map<string, Row>>();

  function getTable(name: string): Map<string, Row> {
    let t = tables.get(name);
    if (!t) {
      t = new Map();
      tables.set(name, t);
    }
    return t;
  }

  const client = {
    from(name: string) {
      return new Builder(getTable(name));
    },
  };

  return client as unknown as SupabaseClient;
}
