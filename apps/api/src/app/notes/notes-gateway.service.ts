import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { subject } from '@casl/ability';
import type { Note, VerifiedToken } from '@icore/shared';
import { NotesClientService } from '@icore/notes-client';
import { AbilityFactory } from '../abilities/ability.factory';

/** Transport-neutral notes logic shared by the REST controller and any GraphQL resolver. */
@Injectable()
export class NotesGatewayService {
  constructor(
    private readonly notes: NotesClientService,
    private readonly abilities: AbilityFactory,
  ) {}

  list(
    user: VerifiedToken | undefined,
    q: { limit?: number; offset?: number },
  ): Promise<{ items: Note[]; total: number }> {
    const ability = this.abilities.forUser(user);
    const ownerId = ability.can('manage', 'Note') ? null : (user?.uid ?? null);
    return this.notes.list({
      ownerId,
      limit: Math.min(100, Number(q.limit) || 20),
      offset: Math.max(0, Number(q.offset) || 0),
    });
  }

  async get(user: VerifiedToken | undefined, id: string): Promise<Note> {
    return this.load(user, id, 'read');
  }

  async create(
    user: VerifiedToken | undefined,
    input: { title: string; body: string },
  ): Promise<Note> {
    if (!user) throw new ForbiddenException();
    return this.notes.create({ ownerId: user.uid, title: input.title, body: input.body });
  }

  async update(
    user: VerifiedToken | undefined,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<Note> {
    await this.load(user, id, 'update');
    return this.notes.update(id, patch);
  }

  async remove(user: VerifiedToken | undefined, id: string): Promise<void> {
    await this.load(user, id, 'delete');
    await this.notes.delete(id);
  }

  private async load(
    user: VerifiedToken | undefined,
    id: string,
    action: 'read' | 'update' | 'delete',
  ): Promise<Note> {
    const note = await this.notes.get(id);
    if (!note) throw new NotFoundException();
    const ability = this.abilities.forUser(user);
    if (!ability.can(action, subject('Note', note) as never)) throw new ForbiddenException();
    return note;
  }
}
