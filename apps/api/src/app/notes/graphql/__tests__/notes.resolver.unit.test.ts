import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CHECK_ABILITY_KEY } from '../../../abilities/check-ability.decorator';
import type { NotesGatewayService } from '../../notes-gateway.service';
import { NotesResolver } from '../notes.resolver';

const user = { uid: 'u1', email: 'u1@x.com', role: 'user' };
const note = {
  id: 'n1',
  ownerId: 'u1',
  title: 't',
  body: 'b',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

function setup() {
  const gateway = {
    list: vi.fn().mockResolvedValue({ items: [note], total: 1 }),
    get: vi.fn().mockResolvedValue(note),
    create: vi.fn().mockResolvedValue(note),
    update: vi.fn().mockResolvedValue({ ...note, title: 'new' }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return {
    gateway,
    resolver: new NotesResolver(gateway as unknown as NotesGatewayService),
  };
}

describe('NotesResolver', () => {
  it('notes delegates to the gateway with the session user and paging', async () => {
    const { gateway, resolver } = setup();
    await expect(resolver.notes(user, 5, 10)).resolves.toEqual({ items: [note], total: 1 });
    expect(gateway.list).toHaveBeenCalledWith(user, { limit: 5, offset: 10 });
  });

  it('notes passes missing paging through for the gateway defaults', async () => {
    const { gateway, resolver } = setup();
    await resolver.notes(user, undefined, undefined);
    expect(gateway.list).toHaveBeenCalledWith(user, { limit: undefined, offset: undefined });
  });

  it('note delegates to gateway.get', async () => {
    const { gateway, resolver } = setup();
    await expect(resolver.note(user, 'n1')).resolves.toBe(note);
    expect(gateway.get).toHaveBeenCalledWith(user, 'n1');
  });

  it('note propagates the gateway NotFound / Forbidden errors unchanged', async () => {
    const { gateway, resolver } = setup();
    gateway.get.mockRejectedValueOnce(new NotFoundException());
    await expect(resolver.note(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    gateway.get.mockRejectedValueOnce(new ForbiddenException());
    await expect(resolver.note(user, 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('createNote delegates the input to gateway.create', async () => {
    const { gateway, resolver } = setup();
    await expect(resolver.createNote(user, { title: 't', body: 'b' })).resolves.toBe(note);
    expect(gateway.create).toHaveBeenCalledWith(user, { title: 't', body: 'b' });
  });

  it('createNote requires the create/Note ability, like the REST controller', () => {
    const rule = Reflect.getMetadata(CHECK_ABILITY_KEY, NotesResolver.prototype.createNote);
    expect(rule).toEqual({ action: 'create', subject: 'Note' });
  });

  it('updateNote delegates id and patch to gateway.update', async () => {
    const { gateway, resolver } = setup();
    const r = await resolver.updateNote(user, 'n1', { title: 'new' });
    expect(r.title).toBe('new');
    expect(gateway.update).toHaveBeenCalledWith(user, 'n1', { title: 'new' });
  });

  it('updateNote propagates a Forbidden from the gateway', async () => {
    const { gateway, resolver } = setup();
    gateway.update.mockRejectedValueOnce(new ForbiddenException());
    await expect(resolver.updateNote(user, 'n1', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deleteNote delegates to gateway.remove and returns true', async () => {
    const { gateway, resolver } = setup();
    await expect(resolver.deleteNote(user, 'n1')).resolves.toBe(true);
    expect(gateway.remove).toHaveBeenCalledWith(user, 'n1');
  });

  it('deleteNote propagates a NotFound from the gateway', async () => {
    const { gateway, resolver } = setup();
    gateway.remove.mockRejectedValueOnce(new NotFoundException());
    await expect(resolver.deleteNote(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
