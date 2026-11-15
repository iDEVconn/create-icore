import { describe, expect, it, vi } from 'vitest';
import type { AuthClientService } from '@icore/auth-client';
import { ProfileGatewayService } from '../profile-gateway.service';
import { ProfileController } from '../profile.controller';

function make(name: string | null = null) {
  const auth = {
    getProfile: vi.fn(async (_uid: string) => ({ name })),
    updateProfile: vi.fn(async (_uid: string, n: string) => ({ name: n })),
  };
  const controller = new ProfileController(
    new ProfileGatewayService(auth as unknown as AuthClientService),
  );
  return { auth, controller };
}

const user = { uid: 'u1', email: 'u1@x.com', role: 'user' };

describe('ProfileController', () => {
  it('GET returns the session identity plus the stored name', async () => {
    const { controller } = make('Ada');
    expect(await controller.me({ user } as never)).toEqual({ ...user, name: 'Ada' });
  });

  it('PATCH writes the trimmed name for the session user', async () => {
    const { controller, auth } = make();
    expect(await controller.update({ user } as never, { name: ' Grace ' })).toEqual({
      ...user,
      name: 'Grace',
    });
    expect(auth.updateProfile).toHaveBeenCalledWith('u1', 'Grace');
  });

  it('PATCH ignores a uid smuggled into the body (only the session identifies the user)', async () => {
    const { controller, auth } = make();
    await controller.update({ user } as never, { name: 'x', uid: 'victim' } as never);
    expect(auth.updateProfile).toHaveBeenCalledWith('u1', 'x');
  });

  it('PATCH without a body is a 400, not a crash', async () => {
    const { controller, auth } = make();
    await expect(controller.update({ user } as never, undefined as never)).rejects.toThrow(
      'invalid_name',
    );
    expect(auth.updateProfile).not.toHaveBeenCalled();
  });
});
