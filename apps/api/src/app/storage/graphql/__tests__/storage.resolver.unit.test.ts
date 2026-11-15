import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { UploadClientService } from '@icore/upload-client';
import { describe, expect, it, vi } from 'vitest';
import { StorageResolver } from '../storage.resolver';

const user = { uid: 'u1', email: 'u1@x.com', role: 'user' };

function setup() {
  const client = {
    list: vi.fn().mockResolvedValue([{ bucket: 'b', path: 'u1/a.png' }]),
    signedUrl: vi.fn().mockResolvedValue('https://signed'),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { client, resolver: new StorageResolver(client as unknown as UploadClientService) };
}

describe('StorageResolver', () => {
  it("files lists the caller's files with the optional prefix", async () => {
    const { client, resolver } = setup();
    await expect(resolver.files(user, 'img')).resolves.toEqual([{ bucket: 'b', path: 'u1/a.png' }]);
    expect(client.list).toHaveBeenCalledWith('u1', 'img');
  });

  it('signedUrl signs a ref the caller owns', async () => {
    const { client, resolver } = setup();
    await expect(resolver.signedUrl(user, 'b', 'u1/a.png', 60)).resolves.toBe('https://signed');
    expect(client.signedUrl).toHaveBeenCalledWith('u1', { bucket: 'b', path: 'u1/a.png' }, 60);
  });

  it('signedUrl refuses a foreign ref without calling the upload service', async () => {
    const { client, resolver } = setup();
    await expect(resolver.signedUrl(user, 'b', 'u2/a.png', undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.signedUrl).not.toHaveBeenCalled();
  });

  it('removeFile deletes a ref the caller owns and returns true', async () => {
    const { client, resolver } = setup();
    await expect(resolver.removeFile(user, 'b', 'u1/a.png')).resolves.toBe(true);
    expect(client.remove).toHaveBeenCalledWith('u1', { bucket: 'b', path: 'u1/a.png' });
  });

  it('removeFile refuses a foreign ref without calling the upload service', async () => {
    const { client, resolver } = setup();
    await expect(resolver.removeFile(user, 'b', 'u2/a.png')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.remove).not.toHaveBeenCalled();
  });

  it('answers 401 when no user is attached, without calling the upload service', async () => {
    const { client, resolver } = setup();
    await expect(resolver.files(undefined, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(client.list).not.toHaveBeenCalled();
  });
});
