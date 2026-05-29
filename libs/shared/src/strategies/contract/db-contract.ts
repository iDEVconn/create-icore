import { describe, expect, it, beforeEach } from 'vitest';
import type { DBStrategy } from '../db';

interface User {
  name: string;
  age: number;
}

export function runDBContract(name: string, factory: () => DBStrategy): void {
  describe(`DBStrategy contract: ${name}`, () => {
    let db: DBStrategy;
    beforeEach(() => {
      db = factory();
    });

    it('get returns null for missing documents', async () => {
      expect(await db.get('users', 'nope')).toBeNull();
    });

    it('set + get round-trips a document', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      const doc = await db.get<User>('users', 'u1');
      expect(doc).toEqual({ id: 'u1', data: { name: 'Alice', age: 30 } });
    });

    it('set replaces the existing document', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.set<User>('users', 'u1', { name: 'Alice', age: 31 });
      const doc = await db.get<User>('users', 'u1');
      expect(doc?.data.age).toBe(31);
    });

    it('update merges fields onto the existing document', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.update<User>('users', 'u1', { age: 31 });
      const doc = await db.get<User>('users', 'u1');
      expect(doc?.data).toEqual({ name: 'Alice', age: 31 });
    });

    it('update throws when document missing', async () => {
      await expect(db.update('users', 'nope', { age: 0 })).rejects.toThrow();
    });

    it('delete removes the document', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.delete('users', 'u1');
      expect(await db.get('users', 'u1')).toBeNull();
    });

    it('delete throws when document missing', async () => {
      await expect(db.delete('users', 'nope')).rejects.toThrow();
    });

    it('list returns all documents in a collection', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.set<User>('users', 'u2', { name: 'Bob', age: 25 });
      const docs = await db.list<User>('users');
      expect(docs).toHaveLength(2);
    });

    it('list filters with where clauses', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.set<User>('users', 'u2', { name: 'Bob', age: 25 });
      const docs = await db.list<User>('users', { where: [{ field: 'age', op: '>', value: 27 }] });
      expect(docs).toHaveLength(1);
      expect(docs[0]?.data.name).toBe('Alice');
    });

    it('list applies limit', async () => {
      for (let i = 0; i < 5; i++) await db.set<User>('users', `u${i}`, { name: `U${i}`, age: i });
      const docs = await db.list<User>('users', { limit: 3 });
      expect(docs).toHaveLength(3);
    });

    it('list orders by field', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.set<User>('users', 'u2', { name: 'Bob', age: 25 });
      const docs = await db.list<User>('users', { orderBy: { field: 'age', direction: 'asc' } });
      expect(docs.map((d) => d.data.name)).toEqual(['Bob', 'Alice']);
    });

    it('isolates collections', async () => {
      await db.set('users', 'u1', { name: 'Alice' });
      expect(await db.list('orders')).toEqual([]);
    });
  });
}
