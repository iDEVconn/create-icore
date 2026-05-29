import type {
  FirestoreCollectionLike,
  FirestoreDocumentLike,
  FirestoreLike,
  FirestoreOp,
} from '../firestore-db.strategy';

interface Stored {
  data: Record<string, unknown>;
}

interface Filter {
  field: string;
  op: FirestoreOp;
  value: unknown;
}

function applyOp(val: unknown, op: FirestoreOp, target: unknown): boolean {
  switch (op) {
    case '==':
      return val === target;
    case '!=':
      return val !== target;
    case '<':
      return (val as number) < (target as number);
    case '<=':
      return (val as number) <= (target as number);
    case '>':
      return (val as number) > (target as number);
    case '>=':
      return (val as number) >= (target as number);
    case 'in':
      return Array.isArray(target) && (target as unknown[]).includes(val);
  }
}

class CollectionQuery implements FirestoreCollectionLike {
  private filters: Filter[] = [];
  private orderField?: string;
  private orderDir: 'asc' | 'desc' = 'asc';
  private limitN?: number;

  constructor(private readonly store: Map<string, Stored>) {}

  doc(id: string): FirestoreDocumentLike {
    const store = this.store;
    return {
      async get() {
        const row = store.get(id);
        return { exists: row != null, data: () => row?.data ?? {} };
      },
      async set(data) {
        store.set(id, { data: data as Record<string, unknown> });
        return undefined;
      },
      async update(patch) {
        const existing = store.get(id);
        if (!existing) throw new Error('not_found');
        store.set(id, { data: { ...existing.data, ...patch } });
        return undefined;
      },
      async delete() {
        if (!store.has(id)) throw new Error('not_found');
        store.delete(id);
        return undefined;
      },
    };
  }

  where(field: string, op: FirestoreOp, value: unknown): FirestoreCollectionLike {
    const next = new CollectionQuery(this.store);
    next.filters = [...this.filters, { field, op, value }];
    next.orderField = this.orderField;
    next.orderDir = this.orderDir;
    next.limitN = this.limitN;
    return next;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FirestoreCollectionLike {
    const next = new CollectionQuery(this.store);
    next.filters = this.filters;
    next.orderField = field;
    next.orderDir = direction;
    next.limitN = this.limitN;
    return next;
  }

  limit(n: number): FirestoreCollectionLike {
    const next = new CollectionQuery(this.store);
    next.filters = this.filters;
    next.orderField = this.orderField;
    next.orderDir = this.orderDir;
    next.limitN = n;
    return next;
  }

  async get(): Promise<{ docs: Array<{ id: string; data(): unknown }> }> {
    let entries = [...this.store.entries()].map(([id, row]) => ({ id, data: row.data }));
    for (const f of this.filters) {
      entries = entries.filter((e) =>
        applyOp((e.data as Record<string, unknown>)[f.field], f.op, f.value),
      );
    }
    if (this.orderField) {
      const field = this.orderField;
      const dir = this.orderDir;
      entries.sort((a, b) => {
        const av = (a.data as Record<string, unknown>)[field];
        const bv = (b.data as Record<string, unknown>)[field];
        const cmp = (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    if (this.limitN != null) entries = entries.slice(0, this.limitN);
    return {
      docs: entries.map((e) => ({ id: e.id, data: () => e.data })),
    };
  }
}

export function createMockFirestore(): FirestoreLike {
  const collections = new Map<string, Map<string, Stored>>();
  return {
    collection(name: string) {
      let store = collections.get(name);
      if (!store) {
        store = new Map();
        collections.set(name, store);
      }
      return new CollectionQuery(store);
    },
  };
}
