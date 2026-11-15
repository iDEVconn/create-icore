import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { AbilityFactory } from '../ability.factory';
import { AbilityGuard } from '../ability.guard';

function ctx(user: { uid: string; role?: string } | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AbilityGuard', () => {
  const factory = new AbilityFactory();

  it('passes when no @CheckAbility metadata is present', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new AbilityGuard(reflector, factory);
    expect(guard.canActivate(ctx({ uid: 'u', role: 'user' }))).toBe(true);
  });

  it('admin passes manage/all', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({ action: 'manage', subject: 'all' }),
    } as unknown as Reflector;
    const guard = new AbilityGuard(reflector, factory);
    expect(guard.canActivate(ctx({ uid: 'u', role: 'admin' }))).toBe(true);
  });

  it('regular user is denied manage/all', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({ action: 'manage', subject: 'all' }),
    } as unknown as Reflector;
    const guard = new AbilityGuard(reflector, factory);
    expect(() => guard.canActivate(ctx({ uid: 'u', role: 'user' }))).toThrow(ForbiddenException);
  });

  it('anonymous (no req.user) is denied manage/all', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({ action: 'manage', subject: 'all' }),
    } as unknown as Reflector;
    const guard = new AbilityGuard(reflector, factory);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it('denies a user without the rule in a graphql context', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({ action: 'manage', subject: 'all' }),
    } as unknown as Reflector;
    const guard = new AbilityGuard(reflector, factory);
    const gql = {
      getType: () => 'graphql',
      getHandler: () => undefined,
      getClass: () => undefined,
      getArgByIndex: (i: number) =>
        i === 2 ? { req: { user: { uid: 'u', role: 'user' } }, res: {} } : undefined,
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(gql)).toThrow(ForbiddenException);
  });
});
