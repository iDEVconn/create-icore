import type { SupabaseClient } from '@supabase/supabase-js';
import type { DBDocument, DBStrategy, QueryOptions } from '@icore/shared';

export interface SupabaseDBStrategyOptions {
  client: SupabaseClient;
}

export class SupabaseDBStrategy implements DBStrategy {
  constructor(private readonly opts: SupabaseDBStrategyOptions) {}

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    const { data, error } = await this.opts.client
      .from(collection)
      .select('id, data')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error((error as { message: string }).message);
    if (data == null) return null;
    const row = data as { id: string; data: T };
    return { id: row.id, data: row.data };
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    const { error } = await this.opts.client.from(collection).upsert({ id, data });
    if (error) throw new Error((error as { message: string }).message);
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const existing = await this.get<T>(collection, id);
    if (!existing) throw new Error(`not_found: ${collection}/${id}`);
    const merged = { ...(existing.data as object), ...(patch as object) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.opts.client.from(collection) as any)
      .update({ data: merged })
      .eq('id', id);
    if (error) throw new Error((error as { message: string }).message);
  }

  async delete(collection: string, id: string): Promise<void> {
    const existing = await this.get(collection, id);
    if (!existing) throw new Error(`not_found: ${collection}/${id}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.opts.client.from(collection) as any).delete().eq('id', id);
    if (error) throw new Error((error as { message: string }).message);
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = this.opts.client.from(collection).select('id, data');

    if (opts?.where) {
      for (const c of opts.where) {
        const path = c.field === 'id' ? 'id' : `data->>${c.field}`;
        switch (c.op) {
          case '==':
            q = q.eq(path, c.value);
            break;
          case '!=':
            q = q.neq(path, c.value);
            break;
          case '<':
            q = q.lt(path, c.value);
            break;
          case '<=':
            q = q.lte(path, c.value);
            break;
          case '>':
            q = q.gt(path, c.value);
            break;
          case '>=':
            q = q.gte(path, c.value);
            break;
          case 'in':
            q = q.in(path, c.value as unknown[]);
            break;
        }
      }
    }

    if (opts?.orderBy) {
      const field = opts.orderBy.field === 'id' ? 'id' : `data->>${opts.orderBy.field}`;
      q = q.order(field, { ascending: opts.orderBy.direction !== 'desc' });
    }

    if (opts?.limit != null) {
      q = q.limit(opts.limit);
    }

    const { data, error } = await q;
    if (error) throw new Error((error as { message: string }).message);
    return ((data ?? []) as Array<{ id: string; data: T }>).map((row) => ({
      id: row.id,
      data: row.data,
    }));
  }
}
