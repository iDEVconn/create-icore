import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClientService } from '@icore/auth-client';
import { ProfileGatewayService } from '../profile-gateway.service';

function make(name: string | null = null) {
  const auth = {
    getProfile: vi.fn(async (_uid: string) => ({ name })),
    updateProfile: vi.fn(async (_uid: string, n: string) => ({ name: n })),
  };
  return { auth, service: new ProfileGatewayService(auth as unknown as AuthClientService) };
}

const user = { uid: 'u1', email: 'u1@x.com', role: 'user' };

describe('ProfileGatewayService', () => {
  it('get returns the session identity plus the stored name', async () => {
    const { service, auth } = make('Ada');
    expect(await service.get(user)).toEqual({ ...user, name: 'Ada' });
    expect(auth.getProfile).toHaveBeenCalledWith('u1');
  });

  it('update validates, then writes for the SESSION uid and returns the new profile', async () => {
    const { service, auth } = make();
    expect(await service.update(user, '  Grace ')).toEqual({ ...user, name: 'Grace' });
    expect(auth.updateProfile).toHaveBeenCalledWith('u1', 'Grace');
  });

  it('update rejects an invalid name before touching the microservice', async () => {
    const { service, auth } = make();
    for (const bad of ['', '   ', undefined, 42, 'a\nb'])
      await expect(service.update(user, bad)).rejects.toThrow(BadRequestException);
    expect(auth.updateProfile).not.toHaveBeenCalled();
  });

  it('answers 401 when no user is attached', async () => {
    const { service } = make();
    await expect(service.get(undefined)).rejects.toThrow(UnauthorizedException);
    await expect(service.update(undefined, 'x')).rejects.toThrow(UnauthorizedException);
  });

  it('nameOf reads the name of the given uid', async () => {
    const { service, auth } = make('Ada');
    expect(await service.nameOf('u9')).toBe('Ada');
    expect(auth.getProfile).toHaveBeenCalledWith('u9');
  });
});
