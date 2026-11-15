import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileGatewayService } from '../../profile-gateway.service';
import { ProfileResolver } from '../profile.resolver';

function make() {
  const profile = {
    nameOf: vi.fn(async (_uid: string) => 'Ada'),
    update: vi.fn(async (_u: unknown, name: string) => ({ uid: 'u1', email: 'e', name })),
  };
  return { profile, resolver: new ProfileResolver(profile as unknown as ProfileGatewayService) };
}

describe('ProfileResolver', () => {
  it('me returns the session user', () => {
    const user = { uid: 'u1', email: 'u1@x.com', role: 'user' };
    expect(make().resolver.me(user)).toBe(user);
  });

  it('me answers 401 instead of a null-field error when no user is attached', () => {
    expect(() => make().resolver.me(undefined)).toThrow(UnauthorizedException);
  });

  it('name is fetched lazily for me, and reused when a mutation already carries it', async () => {
    const { resolver, profile } = make();
    expect(await resolver.name({ uid: 'u1', email: 'e' })).toBe('Ada');
    expect(profile.nameOf).toHaveBeenCalledWith('u1');
    profile.nameOf.mockClear();
    expect(resolver.name({ uid: 'u1', email: 'e', name: 'Grace' })).toBe('Grace');
    expect(resolver.name({ uid: 'u1', email: 'e', name: null })).toBeNull();
    expect(profile.nameOf).not.toHaveBeenCalled();
  });

  it('updateProfile delegates to the gateway service with the session user', async () => {
    const { resolver, profile } = make();
    const user = { uid: 'u1', email: 'e' };
    expect(await resolver.updateProfile(user, 'Grace')).toEqual({
      uid: 'u1',
      email: 'e',
      name: 'Grace',
    });
    expect(profile.update).toHaveBeenCalledWith(user, 'Grace');
  });
});
