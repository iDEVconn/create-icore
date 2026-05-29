import { randomUUID } from 'node:crypto';
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { DBStrategy, ListNotesOptions, Note } from '@icore/shared';

@Controller()
export class NotesController {
  constructor(@Inject('DBStrategy') private readonly db: DBStrategy) {}

  @MessagePattern('notes.list')
  async list(@Payload() p: ListNotesOptions): Promise<{ items: Note[]; total: number }> {
    const where = p.ownerId
      ? [{ field: 'ownerId', op: '==' as const, value: p.ownerId }]
      : undefined;
    const all = await this.db.list<Note>('notes', {
      where,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    return {
      items: all.slice(p.offset, p.offset + p.limit).map((d) => d.data),
      total: all.length,
    };
  }

  @MessagePattern('notes.get')
  async get(@Payload() p: { id: string }): Promise<Note | null> {
    const doc = await this.db.get<Note>('notes', p.id);
    return doc?.data ?? null;
  }

  @MessagePattern('notes.create')
  async create(@Payload() p: { ownerId: string; title: string; body: string }): Promise<Note> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const note: Note = {
      id,
      ownerId: p.ownerId,
      title: p.title,
      body: p.body,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.set('notes', id, note);
    return note;
  }

  @MessagePattern('notes.update')
  async update(
    @Payload() p: { id: string; patch: Partial<Pick<Note, 'title' | 'body'>> },
  ): Promise<Note> {
    await this.db.update<Note>('notes', p.id, {
      ...p.patch,
      updatedAt: new Date().toISOString(),
    });
    const doc = await this.db.get<Note>('notes', p.id);
    if (!doc) throw new Error('note_missing_after_update');
    return doc.data;
  }

  @MessagePattern('notes.delete')
  delete(@Payload() p: { id: string }): Promise<void> {
    return this.db.delete('notes', p.id);
  }
}
