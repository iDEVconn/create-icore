import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ContextAwareThrottlerGuard } from '../context-aware-throttler.guard';

type Exposed = { getRequestResponse(ctx: ExecutionContext): { req: object; res: object } };

describe('ContextAwareThrottlerGuard', () => {
  const guard = Object.create(ContextAwareThrottlerGuard.prototype) as Exposed;
  const req = { id: 'req' };
  const res = { id: 'res' };

  it('returns { req, res } for an http context', () => {
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    const out = guard.getRequestResponse(ctx);
    expect(out.req).toBe(req);
    expect(out.res).toBe(res);
  });

  it('returns { req, res } for a graphql context', () => {
    const ctx = {
      getType: () => 'graphql',
      getArgByIndex: (i: number) => (i === 2 ? { req, res } : undefined),
    } as unknown as ExecutionContext;
    const out = guard.getRequestResponse(ctx);
    expect(out.req).toBe(req);
    expect(out.res).toBe(res);
  });
});
