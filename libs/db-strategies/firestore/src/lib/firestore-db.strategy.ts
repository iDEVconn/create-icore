import type { DBDocument, DBStrategy, QueryOptions } from '@icore/shared';

export type FirestoreOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';

export interface FirestoreDocumentLike {
  get(): Promise<{ exists: boolean; data(): unknown }>;
  set(data: unknown): Promise<unknown>;
  update(patch: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface FirestoreCollectionLike {
  doc(id: string): FirestoreDocumentLike;
  where(field: string, op: FirestoreOp, value: unknown): FirestoreCollectionLike;
  orderBy(field: string, direction?: 'asc' | 'desc'): FirestoreCollectionLike;
  limit(n: number): FirestoreCollectionLike;
  get(): Promise<{ docs: Array<{ id: string; data(): unknown }> }>;
}

export interface FirestoreLike {
  collection(name: string): FirestoreCollectionLike;
}

export interface FirestoreDBStrategyOptions {
  db: FirestoreLike;
}

export class FirestoreDBStrategy implements DBStrategy {
  constructor(private readonly opts: FirestoreDBStrategyOptions) {}

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    const snap = await this.opts.db.collection(collection).doc(id).get();
    return snap.exists ? { id, data: snap.data() as T } : null;
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    await this.opts.db
      .collection(collection)
      .doc(id)
      .set(data as unknown as Record<string, unknown>);
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const existing = await this.opts.db.collection(collection).doc(id).get();
    if (!existing.exists) throw new Error(`not_found: ${collection}/${id}`);
    await this.opts.db
      .collection(collection)
      .doc(id)
      .update(patch as Record<string, unknown>);
  }

  async delete(collection: string, id: string): Promise<void> {
    const existing = await this.opts.db.collection(collection).doc(id).get();
    if (!existing.exists) throw new Error(`not_found: ${collection}/${id}`);
    await this.opts.db.collection(collection).doc(id).delete();
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    let q: FirestoreCollectionLike = this.opts.db.collection(collection);
    if (opts?.where) {
      for (const c of opts.where) {
        q = q.where(c.field, c.op as FirestoreOp, c.value);
      }
    }
    if (opts?.orderBy) {
      q = q.orderBy(opts.orderBy.field, opts.orderBy.direction);
    }
    if (opts?.limit != null) q = q.limit(opts.limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as T }));
  }
}
