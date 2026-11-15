import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { requestOf, responseOf } from '../execution-context';

describe('execution-context', () => {
  const req = { id: 'req' };
  const res = { id: 'res' };

  it('requestOf reads the http request', () => {
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    expect(requestOf(ctx)).toBe(req);
    expect(responseOf(ctx)).toBe(res);
  });

  it('reads req/res from the third handler arg for a graphql context', () => {
    const ctx = {
      getType: () => 'graphql',
      getArgByIndex: (i: number) => (i === 2 ? { req, res } : undefined),
    } as unknown as ExecutionContext;
    expect(requestOf(ctx)).toBe(req);
    expect(responseOf(ctx)).toBe(res);
  });
});
