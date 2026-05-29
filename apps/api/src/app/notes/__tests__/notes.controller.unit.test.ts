import { describe, expect, it, vi } from 'vitest';
import type { NotesClientService } from '@icore/notes-client';
import { AbilityFactory } from '../../abilities/ability.factory';
import { NotesController } from '../notes.controller';

function makeClient(): NotesClientService {
  return {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotesClientService;
}

function makeReq(uid: string | null, role: 'admin' | 'user' | undefined = 'user') {
  return uid ? { user: { uid, email: `${uid}@x.com`, role } } : { user: undefined };
}

const noteFoo = {
  id: 'n1',
  ownerId: 'u1',
  title: 't',
  body: 'b',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('NotesController (gateway)', () => {
  const abilities = new AbilityFactory();

  it('owner list passes own uid as ownerId', async () => {
    const client = makeClient();
    const ctl = new NotesController(client, abilities);
    await ctl.list(makeReq('u1') as never, '20', '0');
    expect(client.list).toHaveBeenCalledWith({ ownerId: 'u1', limit: 20, offset: 0 });
  });

  it('admin list passes ownerId=null (sees all)', async () => {
    const client = makeClient();
    const ctl = new NotesController(client, abilities);
    await ctl.list(makeReq('a1', 'admin') as never, '20', '0');
    expect(client.list).toHaveBeenCalledWith({ ownerId: null, limit: 20, offset: 0 });
  });

  it('get returns 404 when note missing', async () => {
    const client = makeClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const ctl = new NotesController(client, abilities);
    await expect(ctl.get(makeReq('u1') as never, 'n1')).rejects.toThrow();
  });

  it('get rejects 403 when caller is not owner', async () => {
    const client = makeClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(noteFoo);
    const ctl = new NotesController(client, abilities);
    await expect(ctl.get(makeReq('u2') as never, 'n1')).rejects.toThrow();
  });

  it('get returns the note when caller owns it', async () => {
    const client = makeClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(noteFoo);
    const ctl = new NotesController(client, abilities);
    const result = await ctl.get(makeReq('u1') as never, 'n1');
    expect(result.id).toBe('n1');
  });

  it('admin can read any note', async () => {
    const client = makeClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(noteFoo);
    const ctl = new NotesController(client, abilities);
    const result = await ctl.get(makeReq('a1', 'admin') as never, 'n1');
    expect(result.ownerId).toBe('u1');
  });

  it('create forwards ownerId from req.user.uid (not body)', async () => {
    const client = makeClient();
    (client.create as ReturnType<typeof vi.fn>).mockResolvedValue(noteFoo);
    const ctl = new NotesController(client, abilities);
    await ctl.create(makeReq('u1') as never, { title: 't', body: 'b' });
    expect(client.create).toHaveBeenCalledWith({ ownerId: 'u1', title: 't', body: 'b' });
  });

  it('update by non-owner rejects 403', async () => {
    const client = makeClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(noteFoo);
    const ctl = new NotesController(client, abilities);
    await expect(ctl.update(makeReq('u2') as never, 'n1', { title: 'x' })).rejects.toThrow();
  });

  it('delete by owner succeeds', async () => {
    const client = makeClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(noteFoo);
    const ctl = new NotesController(client, abilities);
    await ctl.delete(makeReq('u1') as never, 'n1');
    expect(client.delete).toHaveBeenCalledWith('n1');
  });
});
