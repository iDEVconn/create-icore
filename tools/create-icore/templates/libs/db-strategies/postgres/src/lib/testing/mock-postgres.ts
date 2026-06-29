import type { DBDocument, DBStrategy, QueryOptions } from '@icore/shared';

function applyOp(val: unknown, op: string, target: unknown): boolean {
  switch (op) {
    case '==':
      return String(val) === String(target);
    case '!=':
      return String(val) !== String(target);
    case '<':
      return Number(val) < Number(target);
    case '<=':
      return Number(val) <= Number(target);
    case '>':
      return Number(val) > Number(target);
    case '>=':
      return Number(val) >= Number(target);
    case 'in':
      return Array.isArray(target) && (target as unknown[]).map(String).includes(String(val));
    default:
      return false;
  }
}

function resolveField(data: Record<string, unknown>, id: string, field: string): unknown {
  if (field === 'id') return id;
  return data[field];
}

export function createMockPostgresDB(): DBStrategy {
  const store = new Map<string, Map<string, Record<string, unknown>>>();

  function getTable(collection: string): Map<string, Record<string, unknown>> {
    let t = store.get(collection);
    if (!t) {
      t = new Map();
      store.set(collection, t);
    }
    return t;
  }

  return {
    async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
      const row = getTable(collection).get(id);
      if (!row) return null;
      return { id, data: row as T };
    },

    async set<T>(collection: string, id: string, data: T): Promise<void> {
      getTable(collection).set(id, { ...(data as Record<string, unknown>) });
    },

    async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
      const table = getTable(collection);
      const existing = table.get(id);
      if (!existing) throw new Error(`not_found: ${collection}/${id}`);
      table.set(id, { ...existing, ...(patch as Record<string, unknown>) });
    },

    async delete(collection: string, id: string): Promise<void> {
      const table = getTable(collection);
      if (!table.has(id)) throw new Error(`not_found: ${collection}/${id}`);
      table.delete(id);
    },

    async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
      let entries = [...getTable(collection).entries()].map(([id, data]) => ({ id, data }));

      if (opts?.where) {
        for (const c of opts.where) {
          entries = entries.filter((e) => {
            const val = resolveField(e.data, e.id, c.field);
            return applyOp(val, c.op, c.value);
          });
        }
      }

      if (opts?.orderBy) {
        const { field, direction } = opts.orderBy;
        entries.sort((a, b) => {
          const av = resolveField(a.data, a.id, field);
          const bv = resolveField(b.data, b.id, field);
          const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
          return direction === 'desc' ? -cmp : cmp;
        });
      }

      if (opts?.limit != null) {
        entries = entries.slice(0, opts.limit);
      }

      return entries.map((e) => ({ id: e.id, data: e.data as T }));
    },
  };
}
