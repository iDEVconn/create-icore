import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthClientService } from '@icore/auth-client';
import { FakeSessionStore } from '@icore/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../auth.guard';

interface MockRequest {
  cookies: Record<string, string>;
  user?: { uid: string; email: string; role?: string };
}

function ctxWith(req: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let sessionStore: FakeSessionStore;
  let authClient: { refresh: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  let reflector: Reflector;
  let guard: AuthGuard;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
    authClient = {
      refresh: vi.fn(),
      verify: vi.fn().mockResolvedValue({ uid: 'u1', email: 'a@b.com', role: undefined }),
    };
    reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    guard = new AuthGuard(reflector, authClient as unknown as AuthClientService, sessionStore);
  });

  it('rejects a request with no session cookie', async () => {
    const req: MockRequest = { cookies: {} };
    await expect(guard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown session id', async () => {
    const req: MockRequest = { cookies: { icore_sid: 'nope' } };
    await expect(guard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('populates req.user for a fresh session, does not refresh', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() + 3600_000,
    });
    const req: MockRequest = { cookies: { icore_sid: record.sessionId } };
    await guard.canActivate(ctxWith(req));
    expect(req.user).toEqual({ uid: 'u1', email: 'a@b.com', role: undefined });
    expect(authClient.refresh).not.toHaveBeenCalled();
  });

  // The whole point of storing `role` on the record: @CheckAbility gates read
  // req.user.role, and nothing else re-reads it on the request hot path.
  it('puts the session record role on req.user so CASL sees a real admin', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      role: 'admin',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() + 3600_000,
    });
    const req: MockRequest = { cookies: { icore_sid: record.sessionId } };
    await guard.canActivate(ctxWith(req));
    expect(req.user).toEqual({ uid: 'u1', email: 'a@b.com', role: 'admin' });
  });

  it('refreshes a stale session exactly once under concurrent requests', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() - 1000,
    });
    authClient.refresh.mockResolvedValue({
      accessToken: 'at2',
      refreshToken: 'rt2',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@b.com' },
    });
    const req1: MockRequest = { cookies: { icore_sid: record.sessionId } };
    const req2: MockRequest = { cookies: { icore_sid: record.sessionId } };
    await Promise.all([guard.canActivate(ctxWith(req1)), guard.canActivate(ctxWith(req2))]);
    expect(authClient.refresh).toHaveBeenCalledTimes(1);
    expect(req1.user?.uid).toBe('u1');
    expect(req2.user?.uid).toBe('u1');
  });

  it('maps an explicit invalid_refresh_token rejection to 401 and deletes the session', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() - 1000,
    });
    authClient.refresh.mockRejectedValue(new Error('invalid_refresh_token'));
    const req: MockRequest = { cookies: { icore_sid: record.sessionId } };
    await expect(guard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await sessionStore.get(record.sessionId)).toBeNull();
  });

  it('maps a transient auth-service failure to 503, keeps the session', async () => {
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() - 1000,
    });
    authClient.refresh.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const req: MockRequest = { cookies: { icore_sid: record.sessionId } };
    await expect(guard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(await sessionStore.get(record.sessionId)).not.toBeNull();
  });

  describe('role freshness across a refresh', () => {
    async function staleAdminSession() {
      return sessionStore.create({
        uid: 'u1',
        email: 'a@b.com',
        role: 'admin',
        providerAccessToken: 'at1',
        providerRefreshToken: 'rt1',
        providerAccessTokenExpiresAt: Date.now() - 1000,
      });
    }

    beforeEach(() => {
      authClient.refresh.mockResolvedValue({
        accessToken: 'at2',
        refreshToken: 'rt2',
        expiresIn: 3600,
        user: { id: 'u1', email: 'a@b.com' },
      });
    });

    it('re-resolves the role against the provider instead of carrying a stale one forward', async () => {
      const record = await staleAdminSession();
      // Admin was demoted at the provider after the session was created.
      authClient.verify.mockResolvedValue({ uid: 'u1', email: 'a@b.com', role: 'user' });
      const req: MockRequest = { cookies: { icore_sid: record.sessionId } };
      await guard.canActivate(ctxWith(req));
      expect(authClient.verify).toHaveBeenCalledWith('at2');
      expect(req.user?.role).toBe('user');
      expect((await sessionStore.get(record.sessionId))?.role).toBe('user');
    });

    it('keeps the previous role when role re-resolution fails (best-effort, never fails the request)', async () => {
      const record = await staleAdminSession();
      authClient.verify.mockRejectedValue(new Error('auth MS down'));
      const req: MockRequest = { cookies: { icore_sid: record.sessionId } };
      await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
      expect(req.user?.role).toBe('admin');
    });
  });

  it('maps a session-store failure to 503 rather than leaking a raw 500', async () => {
    const brokenStore = {
      get: vi.fn().mockRejectedValue(new Error('Stream isn’t writeable')),
    } as unknown as FakeSessionStore;
    const brokenGuard = new AuthGuard(
      reflector,
      authClient as unknown as AuthClientService,
      brokenStore,
    );
    const req: MockRequest = { cookies: { icore_sid: 'whatever' } };
    await expect(brokenGuard.canActivate(ctxWith(req))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
