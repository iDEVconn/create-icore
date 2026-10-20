import { describe, it, expect } from 'vitest';
import { runDBContract } from '@icore/shared/testing';
import { createD1BindingClient } from '../d1-binding-client';
import { D1DBStrategy } from '../d1-db.strategy';
import { createFakeD1Binding } from '../testing/fake-d1-binding';

describe('createD1BindingClient', () => {
  it('maps results and meta.changes to rows and changes', async () => {
    const db = createFakeD1Binding();
    const client = createD1BindingClient(db);
    await client.query('CREATE TABLE t (id TEXT, n INTEGER)');
    const ins = await client.query('INSERT INTO t VALUES (?, ?)', ['a', 1]);
    expect(ins.changes).toBe(1);
    const sel = await client.query<{ id: string; n: number }>('SELECT * FROM t WHERE id = ?', [
      'a',
    ]);
    expect(sel.rows).toEqual([{ id: 'a', n: 1 }]);
  });

  it('passes params through bind() in order, and binds none when omitted', async () => {
    const db = createFakeD1Binding();
    const client = createD1BindingClient(db);
    await client.query('SELECT ?, ?', ['x', 2]);
    await client.query('SELECT 1');
    expect(db.calls).toEqual([
      { sql: 'SELECT ?, ?', params: ['x', 2] },
      { sql: 'SELECT 1', params: [] },
    ]);
  });

  it('defaults changes to 0 when meta omits it', async () => {
    const client = createD1BindingClient({
      prepare: () => ({ bind: () => ({ all: async () => ({ results: [], meta: {} }) }) }),
    });
    expect((await client.query('SELECT 1')).changes).toBe(0);
  });

  it('propagates binding errors', async () => {
    const client = createD1BindingClient({
      prepare: () => ({
        bind: () => ({
          all: async () => {
            throw new Error('D1_ERROR: no such table');
          },
        }),
      }),
    });
    await expect(client.query('SELECT * FROM nope')).rejects.toThrow('no such table');
  });
});

runDBContract(
  'D1DBStrategy (binding)',
  () => new D1DBStrategy(createD1BindingClient(createFakeD1Binding())),
);
