import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { ListNotesOptions, Note } from '@icore/shared';
import { NOTES_CLIENT } from './notes-client.tokens';

@Injectable()
export class NotesClientService {
  constructor(@Inject(NOTES_CLIENT) private readonly client: ClientProxy) {}

  list(opts: ListNotesOptions): Promise<{ items: Note[]; total: number }> {
    return firstValueFrom(this.client.send<{ items: Note[]; total: number }>('notes.list', opts));
  }

  get(id: string): Promise<Note | null> {
    return firstValueFrom(this.client.send<Note | null>('notes.get', { id }));
  }

  create(input: { ownerId: string; title: string; body: string }): Promise<Note> {
    return firstValueFrom(this.client.send<Note>('notes.create', input));
  }

  update(id: string, patch: Partial<Pick<Note, 'title' | 'body'>>): Promise<Note> {
    return firstValueFrom(this.client.send<Note>('notes.update', { id, patch }));
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.delete', { id }));
  }
}
