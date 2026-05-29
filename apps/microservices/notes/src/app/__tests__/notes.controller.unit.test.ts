import { describe, expect, it, beforeEach } from 'vitest';
import { FakeDBStrategy } from '@icore/shared';
import { NotesController } from '../notes.controller';

describe('NotesController', () => {
  let db: FakeDBStrategy;
  let controller: NotesController;

  beforeEach(() => {
    db = new FakeDBStrategy();
    controller = new NotesController(db);
  });

  it('create + get round-trips a note', async () => {
    const note = await controller.create({ ownerId: 'u1', title: 'Hi', body: 'world' });
    expect(note.id).toBeTruthy();
    expect(note.ownerId).toBe('u1');
    expect(note.createdAt).toBe(note.updatedAt);
    const found = await controller.get({ id: note.id });
    expect(found?.body).toBe('world');
  });

  it('get returns null for missing id', async () => {
    expect(await controller.get({ id: 'nope' })).toBeNull();
  });

  it('list filters by ownerId when provided', async () => {
    await controller.create({ ownerId: 'u1', title: 'a', body: '' });
    await controller.create({ ownerId: 'u2', title: 'b', body: '' });
    const mine = await controller.list({ ownerId: 'u1', limit: 10, offset: 0 });
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]?.ownerId).toBe('u1');
  });

  it('list with null ownerId returns all (admin path)', async () => {
    await controller.create({ ownerId: 'u1', title: 'a', body: '' });
    await controller.create({ ownerId: 'u2', title: 'b', body: '' });
    const all = await controller.list({ ownerId: null, limit: 10, offset: 0 });
    expect(all.items).toHaveLength(2);
    expect(all.total).toBe(2);
  });

  it('update merges patch + bumps updatedAt', async () => {
    const note = await controller.create({ ownerId: 'u1', title: 'old', body: '' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await controller.update({ id: note.id, patch: { title: 'new' } });
    expect(updated.title).toBe('new');
    expect(updated.updatedAt).not.toBe(note.updatedAt);
  });

  it('delete removes the note', async () => {
    const note = await controller.create({ ownerId: 'u1', title: 'x', body: '' });
    await controller.delete({ id: note.id });
    expect(await controller.get({ id: note.id })).toBeNull();
  });

  it('list pagination slices items by offset + limit', async () => {
    for (let i = 0; i < 5; i++) {
      await controller.create({ ownerId: 'u1', title: `n${i}`, body: '' });
    }
    const page = await controller.list({ ownerId: 'u1', limit: 2, offset: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
  });
});
