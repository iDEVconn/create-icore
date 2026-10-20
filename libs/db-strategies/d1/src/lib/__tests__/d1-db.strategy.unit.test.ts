import { describe, expect, it, vi } from 'vitest';
import type { D1ClientLike } from '../d1-client';
import { D1_MAX_BOUND_PARAMS, D1DBStrategy } from '../d1-db.strategy';
import { createSqliteD1Client } from '../testing/sqlite-d1-client';

const modes = [
  ['typed params', false],
  ['stringified params', true],
] as const;

describe.each(modes)('D1DBStrategy where semantics (%s)', (_name, stringifyParams) => {
  const make = async () => {
    const db = new D1DBStrategy(createSqliteD1Client({ stringifyParams }));
    await db.set('users', 'a', { name: 'a', age: 30, active: true, tag: 'x' });
    await db.set('users', 'b', { name: 'b', age: 25, active: false, tag: 'y' });
    await db.set('users', 'c', { name: 'c', age: 1, active: true, tag: 'z' });
    return db;
  };
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

  it('where == true matches stored boolean', async () => {
    const db = await make();
    const rows = await db.list('users', { where: [{ field: 'active', op: '==', value: true }] });
    expect(ids(rows)).toEqual(['a', 'c']);
  });

  it('where == 30 matches stored number', async () => {
    const db = await make();
    const rows = await db.list('users', { where: [{ field: 'age', op: '==', value: 30 }] });
    expect(ids(rows)).toEqual(['a']);
  });

  it('where != 30 excludes stored number', async () => {
    const db = await make();
    const rows = await db.list('users', { where: [{ field: 'age', op: '!=', value: 30 }] });
    expect(ids(rows)).toEqual(['b', 'c']);
  });

  it('where in [1,2] matches numbers', async () => {
    const db = await make();
    const rows = await db.list('users', { where: [{ field: 'age', op: 'in', value: [1, 2] }] });
    expect(ids(rows)).toEqual(['c']);
  });

  it("where in ['a','b'] matches text", async () => {
    const db = await make();
    const rows = await db.list('users', {
      where: [{ field: 'name', op: 'in', value: ['a', 'b'] }],
    });
    expect(ids(rows)).toEqual(['a', 'b']);
  });

  it('where on id compares plain text', async () => {
    const db = await make();
    const rows = await db.list('users', { where: [{ field: 'id', op: '==', value: 'b' }] });
    expect(ids(rows)).toEqual(['b']);
  });
});

describe('D1DBStrategy guards', () => {
  it('list with 101 in-values rejects with too_many_params and issues no query', async () => {
    const inner = createSqliteD1Client();
    const spy = vi.fn(inner.query.bind(inner));
    const db = new D1DBStrategy({ query: spy } as D1ClientLike);
    await db.set('users', 'a', { n: 1 });
    spy.mockClear();
    const values = Array.from({ length: D1_MAX_BOUND_PARAMS + 1 }, (_, i) => i);
    await expect(
      db.list('users', { where: [{ field: 'n', op: 'in', value: values }] }),
    ).rejects.toThrow(/too_many_params/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('update on a missing id rejects with not_found: users/nope', async () => {
    const db = new D1DBStrategy(createSqliteD1Client());
    await expect(db.update('users', 'nope', { a: 1 })).rejects.toThrow('not_found: users/nope');
  });

  it('delete on a missing id rejects with not_found', async () => {
    const db = new D1DBStrategy(createSqliteD1Client());
    await expect(db.delete('users', 'nope')).rejects.toThrow('not_found: users/nope');
  });

  it('rejects an invalid collection name', async () => {
    const db = new D1DBStrategy(createSqliteD1Client());
    await expect(db.get('us"ers', 'a')).rejects.toThrow(/Invalid SQL identifier/);
  });

  it('rejects an invalid where field name', async () => {
    const db = new D1DBStrategy(createSqliteD1Client());
    await expect(
      db.list('users', { where: [{ field: "a'; --", op: '==', value: 1 }] }),
    ).rejects.toThrow(/Invalid SQL identifier/);
  });

  it('limit is inlined as a validated integer (limit -1 or 1.5 rejects)', async () => {
    const db = new D1DBStrategy(createSqliteD1Client());
    await db.set('users', 'a', { n: 1 });
    await db.set('users', 'b', { n: 2 });
    expect(await db.list('users', { limit: 1 })).toHaveLength(1);
    await expect(db.list('users', { limit: -1 })).rejects.toThrow(/limit/);
    await expect(db.list('users', { limit: 1.5 })).rejects.toThrow(/limit/);
    await expect(db.list('users', { limit: NaN })).rejects.toThrow(/limit/);
  });
});
