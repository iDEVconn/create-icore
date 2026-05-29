export type DocumentId = string;

export interface DBDocument<T> {
  id: DocumentId;
  data: T;
}

export interface WhereClause {
  field: string;
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';
  value: unknown;
}

export interface QueryOptions {
  where?: WhereClause[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
}

export interface DBStrategy {
  /** Read a single document by id. Returns null when not found. */
  get<T>(collection: string, id: DocumentId): Promise<DBDocument<T> | null>;

  /** Upsert a document under the given id. Replaces the document body entirely. */
  set<T>(collection: string, id: DocumentId, data: T): Promise<void>;

  /** Patch a document (shallow merge). Throws if the document does not exist. */
  update<T>(collection: string, id: DocumentId, patch: Partial<T>): Promise<void>;

  /** Delete a document. Throws if the document does not exist. */
  delete(collection: string, id: DocumentId): Promise<void>;

  /** Query a collection. Empty options = list everything (capped by impl). */
  list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]>;
}
