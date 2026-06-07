import { Connection, Model, Schema } from 'mongoose';
import { DBStrategy, DBDocument, QueryOptions } from '@icore/shared';

export interface MongoDbDBStrategyOptions {
  connection: Connection;
}

export class MongoDbDBStrategy implements DBStrategy {
  private models: Map<string, Model<unknown>> = new Map();

  constructor(private readonly opts: MongoDbDBStrategyOptions) {}

  private getModel(collection: string): Model<{ id: string; data: unknown }> {
    if (!this.models.has(collection)) {
      const schema = new Schema(
        {
          id: { type: String, required: true, index: true },
          data: { type: Schema.Types.Mixed, required: true },
        },
        { strict: false, timestamps: true },
      );
      const model = this.opts.connection.model(collection, schema);
      this.models.set(collection, model);
      return model;
    }
    return this.models.get(collection) as Model<{ id: string; data: unknown }>;
  }

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    const model = this.getModel(collection);
    const doc = await model.findOne({ id }).lean().exec();
    if (!doc) return null;
    return { id: doc.id, data: doc.data as T };
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    const model = this.getModel(collection);
    await model.findOneAndUpdate({ id }, { id, data }, { upsert: true }).exec();
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const model = this.getModel(collection);
    // Use dot notation for partial updates of the 'data' field
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      update[`data.${key}`] = value;
    }
    const result = await model.findOneAndUpdate({ id }, { $set: update }).exec();
    if (!result) throw new Error(`not_found: ${collection}/${id}`);
  }

  async delete(collection: string, id: string): Promise<void> {
    const model = this.getModel(collection);
    const result = await model.findOneAndDelete({ id }).exec();
    if (!result) throw new Error(`not_found: ${collection}/${id}`);
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    const model = this.getModel(collection);
    let q = model.find();

    if (opts?.where) {
      const filter: Record<string, unknown> = {};
      for (const c of opts.where) {
        const path = c.field === 'id' ? 'id' : `data.${c.field}`;
        switch (c.op) {
          case '==':
            filter[path] = c.value;
            break;
          case '!=':
            filter[path] = { $ne: c.value };
            break;
          case '<':
            filter[path] = { $lt: c.value };
            break;
          case '<=':
            filter[path] = { $lte: c.value };
            break;
          case '>':
            filter[path] = { $gt: c.value };
            break;
          case '>=':
            filter[path] = { $gte: c.value };
            break;
          case 'in':
            filter[path] = { $in: c.value };
            break;
        }
      }
      q = q.where(filter);
    }

    if (opts?.orderBy) {
      const field = opts.orderBy.field === 'id' ? 'id' : `data.${opts.orderBy.field}`;
      q = q.sort({ [field]: opts.orderBy.direction === 'desc' ? -1 : 1 });
    }

    if (opts?.limit != null) {
      q = q.limit(opts.limit);
    }

    const docs = await q.lean().exec();
    return docs.map((doc) => ({
      id: (doc as { id: string }).id,
      data: (doc as { data: T }).data,
    }));
  }
}
