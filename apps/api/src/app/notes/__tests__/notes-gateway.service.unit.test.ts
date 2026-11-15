import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { NotesClientService } from '@icore/notes-client';
import { AbilityFactory } from '../../abilities/ability.factory';
import { NotesGatewayService } from '../notes-gateway.service';

function makeClient(): NotesClientService {
  return {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotesClientService;
}

const user = (uid: string, role: 'admin' | 'user' = 'user') => ({
  uid,
  email: `${uid}@x.com`,
  role,
});

const note = {
  id: 'n1',
  ownerId: 'u1',
  title: 't',
  body: 'b',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

function setup() {
  const client = makeClient();
  return { client, svc: new NotesGatewayService(client, new AbilityFactory()) };
}

describe('NotesGatewayService', () => {
  it('list passes the caller uid as ownerId for a user', async () => {
    const { client, svc } = setup();
    await svc.list(user('u1'), { limit: 20, offset: 0 });
    expect(client.list).toHaveBeenCalledWith({ ownerId: 'u1', limit: 20, offset: 0 });
  });

  it('list passes ownerId=null for an admin', async () => {
    const { client, svc } = setup();
    await svc.list(user('a1', 'admin'), {});
    expect(client.list).toHaveBeenCalledWith({ ownerId: null, limit: 20, offset: 0 });
  });

  it('list clamps limit to 100 and offset to >= 0', async () => {
    const { client, svc } = setup();
    await svc.list(user('u1'), { limit: 5000, offset: -3 });
    expect(client.list).toHaveBeenCalledWith({ ownerId: 'u1', limit: 100, offset: 0 });
  });

  it('list clamps a negative limit to 1', async () => {
    const { client, svc } = setup();
    await svc.list(user('u1'), { limit: -5, offset: 0 });
    expect(client.list).toHaveBeenCalledWith({ ownerId: 'u1', limit: 1, offset: 0 });
  });

  // GraphQL inputs are nullable per field and REST bodies are untyped: a null or non-string
  // value must never reach the store (it would break every later list/read of the note).
  it.each([
    ['title null', { title: null, body: 'b' }],
    ['body missing', { title: 't' }],
    ['title a number', { title: 1, body: 'b' }],
  ])('create rejects %s with BadRequestException', async (_l, input) => {
    const { client, svc } = setup();
    await expect(svc.create(user('u1'), input as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.create).not.toHaveBeenCalled();
  });

  it.each([
    ['empty patch', {}],
    ['only null fields', { title: null, body: null }],
    ['only non-string fields', { title: 3 }],
  ])('update rejects %s with BadRequestException, nothing written', async (_l, patch) => {
    const { client, svc } = setup();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(note);
    await expect(svc.update(user('u1'), 'n1', patch as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.update).not.toHaveBeenCalled();
  });

  it('update forwards only the string fields of the patch', async () => {
    const { client, svc } = setup();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(note);
    await svc.update(user('u1'), 'n1', { title: 'new', body: null } as never);
    expect(client.update).toHaveBeenCalledWith('n1', { title: 'new' });
  });

  it('get throws NotFoundException when missing', async () => {
    const { client, svc } = setup();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(svc.get(user('u1'), 'n1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("get throws ForbiddenException for another user's note", async () => {
    const { client, svc } = setup();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(note);
    await expect(svc.get(user('u2'), 'n1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('get returns the note for its owner', async () => {
    const { client, svc } = setup();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(note);
    await expect(svc.get(user('u1'), 'n1')).resolves.toEqual(note);
  });

  it('create throws ForbiddenException without a user', async () => {
    const { client, svc } = setup();
    await expect(svc.create(undefined, { title: 't', body: 'b' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.create).not.toHaveBeenCalled();
  });

  it('create sets ownerId from the user', async () => {
    const { client, svc } = setup();
    await svc.create(user('u1'), { title: 't', body: 'b' });
    expect(client.create).toHaveBeenCalledWith({ ownerId: 'u1', title: 't', body: 'b' });
  });

  it('update rejects a non-owner and allows the owner', async () => {
    const { client, svc } = setup();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(note);
    await expect(svc.update(user('u2'), 'n1', { title: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await svc.update(user('u1'), 'n1', { title: 'x' });
    expect(client.update).toHaveBeenCalledWith('n1', { title: 'x' });
  });

  it('remove rejects a non-owner, 404s when missing, deletes for owner', async () => {
    const { client, svc } = setup();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(svc.remove(user('u1'), 'n1')).rejects.toBeInstanceOf(NotFoundException);
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(note);
    await expect(svc.remove(user('u2'), 'n1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.delete).not.toHaveBeenCalled();
    await svc.remove(user('u1'), 'n1');
    expect(client.delete).toHaveBeenCalledWith('n1');
  });
});
