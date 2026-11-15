import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Note, VerifiedToken } from '@icore/shared';
import { CheckAbility } from '../../abilities/check-ability.decorator';
import { CurrentUser } from '../../http/current-user.decorator';
import { NotesGatewayService } from '../notes-gateway.service';
import { CreateNoteInput, UpdateNoteInput } from './note.inputs';
import { NoteModel, NotePage } from './note.model';

/** GraphQL surface of notes. Every rule (ownership, admin sees all) lives in NotesGatewayService. */
@Resolver(() => NoteModel)
export class NotesResolver {
  constructor(private readonly gateway: NotesGatewayService) {}

  @Query(() => NotePage, { description: 'List notes (admin sees all, users see own)' })
  notes(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('limit', { type: () => Int, nullable: true }) limit: number | undefined,
    @Args('offset', { type: () => Int, nullable: true }) offset: number | undefined,
  ): Promise<{ items: Note[]; total: number }> {
    return this.gateway.list(user, { limit: limit ?? undefined, offset: offset ?? undefined });
  }

  @Query(() => NoteModel, { description: 'Get a note by id' })
  note(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Note> {
    return this.gateway.get(user, id);
  }

  @Mutation(() => NoteModel, { description: 'Create a note (ownerId is set from the session)' })
  @CheckAbility('create', 'Note')
  createNote(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('input', { type: () => CreateNoteInput }) input: CreateNoteInput,
  ): Promise<Note> {
    return this.gateway.create(user, { title: input.title, body: input.body });
  }

  @Mutation(() => NoteModel, { description: 'Update a note (owner or admin only)' })
  updateNote(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateNoteInput }) input: UpdateNoteInput,
  ): Promise<Note> {
    return this.gateway.update(user, id, input);
  }

  @Mutation(() => Boolean, { description: 'Delete a note (owner or admin only)' })
  async deleteNote(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.gateway.remove(user, id);
    return true;
  }
}
