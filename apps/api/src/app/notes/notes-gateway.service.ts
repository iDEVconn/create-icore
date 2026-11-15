import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      limit: Math.max(1, Math.min(100, Number(q.limit) || 20)),
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
    if (typeof input?.title !== 'string' || typeof input?.body !== 'string') {
      throw new BadRequestException('title and body must be strings');
    }
    return this.notes.create({ ownerId: user.uid, title: input.title, body: input.body });
  }

  async update(
    user: VerifiedToken | undefined,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<Note> {
    // GraphQL input fields are nullable and REST bodies are untyped: only string fields reach
    // the store, and a patch without any is refused (a null title would break later reads).
    const clean: { title?: string; body?: string } = {};
    if (typeof patch?.title === 'string') clean.title = patch.title;
    if (typeof patch?.body === 'string') clean.body = patch.body;
    if (Object.keys(clean).length === 0) {
      throw new BadRequestException('nothing to update: title and/or body must be strings');
    }
    await this.load(user, id, 'update');
    return this.notes.update(id, clean);
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
