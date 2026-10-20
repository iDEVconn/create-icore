// @ts-ignore - provided by the workerd runtime
import { DurableObject } from 'cloudflare:workers';

// SQLite-backed Durable Object used only to measure the cost of one object round trip.
export class ProbeDurableObject extends (DurableObject as new (ctx: any, env: any) => any) {
  private readonly sql: any;

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)',
    );
    this.sql.exec('INSERT OR IGNORE INTO counter (id, n) VALUES (1, 0)');
  }

  async fetch(): Promise<Response> {
    this.sql.exec('UPDATE counter SET n = n + 1 WHERE id = 1');
    const row = this.sql.exec('SELECT n FROM counter WHERE id = 1').one();
    return Response.json({ n: row.n });
  }
}
