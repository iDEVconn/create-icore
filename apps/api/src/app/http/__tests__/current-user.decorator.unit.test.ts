import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { CurrentUser, type CurrentUserPayload } from '../current-user.decorator';

// Reads the factory Nest registers for @CurrentUser() and runs it against both context types.
function factoryOf(): (data: unknown, ctx: ExecutionContext) => unknown {
  class Target {
    handler(@CurrentUser() _user: unknown) {
      return _user;
    }
  }
  const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'handler') as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => unknown }
  >;
  const entry = Object.values(meta)[0];
  if (!entry) throw new Error('CurrentUser registered no route-arg factory');
  return entry.factory;
}

const user = { uid: 'u1', email: 'u1@example.com', role: 'user' };

describe('CurrentUser', () => {
  it('resolves req.user on an http context', () => {
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
    expect(factoryOf()(undefined, ctx)).toBe(user);
  });

  it('resolves req.user from the GraphQL context', () => {
    const ctx = {
      getType: () => 'graphql',
      getArgByIndex: (i: number) => (i === 2 ? { req: { user }, res: {} } : undefined),
    } as unknown as ExecutionContext;
    expect(factoryOf()(undefined, ctx)).toBe(user);
  });

  it('is undefined when no user was attached', () => {
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    expect(factoryOf()(undefined, ctx)).toBeUndefined();
  });
});

// Compile-time pin: the provider token shape stays assignable to the decorator's payload.
// Type-only import, so the test ships no runtime dependency on the strategies folder.
type AssertAssignable<T extends CurrentUserPayload> = T;
export type VerifiedTokenFitsPayload = AssertAssignable<{
  uid: string;
  email?: string;
  role?: string;
}>;
