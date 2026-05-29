import type { DBDocument, DBStrategy, QueryOptions, WhereClause } from '../db';

function matchClause<T>(doc: T, clause: WhereClause): boolean {
  const fieldValue = (doc as Record<string, unknown>)[clause.field];
  switch (clause.op) {
    case '==':
      return fieldValue === clause.value;
    case '!=':
      return fieldValue !== clause.value;
    case '<':
      return (fieldValue as number) < (clause.value as number);
    case '<=':
      return (fieldValue as number) <= (clause.value as number);
    case '>':
      return (fieldValue as number) > (clause.value as number);
    case '>=':
      return (fieldValue as number) >= (clause.value as number);
    case 'in':
      return Array.isArray(clause.value) && (clause.value as unknown[]).includes(fieldValue);
  }
}

export class FakeDBStrategy implements DBStrategy {
  private readonly store = new Map<string, Map<string, unknown>>();

  private getCollection(name: string): Map<string, unknown> {
    let col = this.store.get(name);
    if (!col) {
      col = new Map();
      this.store.set(name, col);
    }
    return col;
  }

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    const col = this.store.get(collection);
    const data = col?.get(id);
    return data == null ? null : { id, data: data as T };
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    this.getCollection(collection).set(id, structuredClone(data));
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const col = this.store.get(collection);
    const existing = col?.get(id);
    if (existing == null) throw new Error(`not_found: ${collection}/${id}`);
    col!.set(id, { ...(existing as object), ...patch });
  }

  async delete(collection: string, id: string): Promise<void> {
    const col = this.store.get(collection);
    if (!col || !col.has(id)) throw new Error(`not_found: ${collection}/${id}`);
    col.delete(id);
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    const col = this.store.get(collection);
    if (!col) return [];
    let entries = [...col.entries()].map(([id, data]) => ({ id, data: data as T }));
    if (opts?.where) {
      for (const clause of opts.where) {
        entries = entries.filter((e) => matchClause(e.data, clause));
      }
    }
    if (opts?.orderBy) {
      const { field, direction = 'asc' } = opts.orderBy;
      entries.sort((a, b) => {
        const av = (a.data as Record<string, unknown>)[field];
        const bv = (b.data as Record<string, unknown>)[field];
        const cmp = (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
        return direction === 'asc' ? cmp : -cmp;
      });
    }
    if (opts?.limit != null) entries = entries.slice(0, opts.limit);
    return entries;
  }
}
