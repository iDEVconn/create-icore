import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { signHmac } from '@icore/shared';
import { HmacAuthGuard } from '../hmac.guard';

function makeContext(data: Record<string, unknown>): ExecutionContext {
  return {
    switchToRpc: () => ({ getData: () => data }),
  } as unknown as ExecutionContext;
}

describe('HmacAuthGuard', () => {
  const ORIGINAL_ENV = { ...process.env };
  const guard = new HmacAuthGuard();

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
  });

  it('allows any request through (with a warning) when AUTH_TCP_SECRET is not configured outside production', () => {
    delete process.env['AUTH_TCP_SECRET'];
    delete process.env['NODE_ENV'];
    const ctx = makeContext({ uid: 'u1' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws when AUTH_TCP_SECRET is not configured in production', () => {
    delete process.env['AUTH_TCP_SECRET'];
    process.env['NODE_ENV'] = 'production';
    const ctx = makeContext({ uid: 'u1' });
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('throws RpcException when the secret is configured but the payload has no _sig', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const ctx = makeContext({ uid: 'u1', _ts: Date.now() });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the payload has no _ts', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const data = { uid: 'u1' };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when _sig does not match the payload', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const ctx = makeContext({ uid: 'u1', _ts: Date.now(), _sig: 'wrong-signature' });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the timestamp is older than the clock-skew tolerance (replay)', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const staleTs = Date.now() - 60_000; // 60s old — outside the 30s tolerance
    const data = { uid: 'u1', _ts: staleTs };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the timestamp is in the future beyond tolerance (clock skew abuse)', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const futureTs = Date.now() + 60_000;
    const data = { uid: 'u1', _ts: futureTs };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('allows the request through and strips _sig + _ts when the signature is valid and fresh', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const data: Record<string, unknown> = { uid: 'u1', role: 'admin', _ts: Date.now() };
    data['_sig'] = signHmac(data, 'test-secret');
    const ctx = makeContext(data);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(data).toEqual({ uid: 'u1', role: 'admin' });
  });
});
