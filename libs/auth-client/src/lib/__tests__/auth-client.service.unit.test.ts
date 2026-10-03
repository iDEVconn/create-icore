import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEVER, TimeoutError, of, throwError } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyHmac } from '@icore/shared';
import { AuthClientService, IN_LOCK_RPC_TIMEOUT_MS } from '../auth-client.service';

describe('AuthClientService — wire contract', () => {
  it('setRole() sends uid+role and resolves against the real {ok:true} wire response', async () => {
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.setRole('u1', 'admin')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith('auth.setRole', { uid: 'u1', role: 'admin' });
  });

  it('sendMagicLink() sends email+callbackUrl and resolves against the real {ok:true} wire response', async () => {
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.sendMagicLink('a@x.com', 'http://localhost/cb')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith('auth.magicLink.send', {
      email: 'a@x.com',
      callbackUrl: 'http://localhost/cb',
    });
  });
});

describe('AuthClientService — RPC error mapping', () => {
  it('maps user_already_exists to ConflictException', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('user_already_exists')));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.signup('a@x.com', 'pw12345!')).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps invalid_credentials to UnauthorizedException', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('invalid_credentials')));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.login('a@x.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('signup forwards callbackUrl in the RPC payload', async () => {
    const send = vi.fn(() =>
      of({ status: 'confirmation_required', user: { id: 'u1', email: 'a@x.com' } }),
    );
    const service = new AuthClientService({ send } as unknown as ClientProxy);

    const result = await service.signup('a@x.com', 'pw12345!', 'https://my.app/auth/callback');

    expect(send).toHaveBeenCalledWith('auth.signup', {
      email: 'a@x.com',
      password: 'pw12345!',
      callbackUrl: 'https://my.app/auth/callback',
    });
    expect(result).toMatchObject({ status: 'confirmation_required' });
  });

  it('maps email_not_confirmed to ForbiddenException', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('email_not_confirmed')));
    const service = new AuthClientService({ send } as unknown as ClientProxy);

    await expect(service.login('a@x.com', 'pw12345!')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requestPasswordReset sends email + callbackUrl and resolves against {ok:true}', async () => {
    const send = vi.fn(() => of({ ok: true as const }));
    const service = new AuthClientService({ send } as unknown as ClientProxy);
    await expect(
      service.requestPasswordReset('a@x.com', 'https://my.app/reset-password'),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith('auth.password.forgot', {
      email: 'a@x.com',
      callbackUrl: 'https://my.app/reset-password',
    });
  });

  it('confirmPasswordReset sends token + password and maps invalid_reset_token to BadRequestException', async () => {
    const ok = vi.fn(() =>
      of({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 3600,
        user: { id: 'u1', email: 'a@x.com' },
      }),
    );
    await new AuthClientService({ send: ok } as unknown as ClientProxy).confirmPasswordReset(
      'tok',
      'newpw123!',
    );
    expect(ok).toHaveBeenCalledWith('auth.password.reset', {
      token: 'tok',
      password: 'newpw123!',
    });

    const bad = vi.fn(() => throwError(() => new RpcException('invalid_reset_token')));
    await expect(
      new AuthClientService({ send: bad } as unknown as ClientProxy).confirmPasswordReset(
        'x',
        'newpw123!',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps weak_password to BadRequestException', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('weak_password')));
    const service = new AuthClientService({ send } as unknown as ClientProxy);
    await expect(service.confirmPasswordReset('tok', 'abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('passes through unrecognized RPC errors unchanged', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('some_unmapped_error')));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.login('a@x.com', 'pw')).rejects.not.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthClientService — TCP HMAC signing', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('does not sign requests when AUTH_TCP_SECRET is not configured', async () => {
    delete process.env['AUTH_TCP_SECRET'];
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await service.setRole('u1', 'admin');

    expect(send).toHaveBeenCalledWith('auth.setRole', { uid: 'u1', role: 'admin' });
  });

  it('signs the payload with an HMAC and a timestamp when AUTH_TCP_SECRET is configured', async () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    const before = Date.now();
    await service.setRole('u1', 'admin');
    const after = Date.now();

    expect(send).toHaveBeenCalledWith(
      'auth.setRole',
      expect.objectContaining({
        uid: 'u1',
        role: 'admin',
        _ts: expect.any(Number),
        _sig: expect.any(String),
      }),
    );
    const sentPayload = send.mock.calls[0]?.[1] as {
      uid: string;
      role: string;
      _ts: number;
      _sig: string;
    };
    expect(sentPayload._ts).toBeGreaterThanOrEqual(before);
    expect(sentPayload._ts).toBeLessThanOrEqual(after);
    expect(
      verifyHmac(
        { uid: 'u1', role: 'admin', _ts: sentPayload._ts },
        sentPayload._sig,
        'test-secret',
      ),
    ).toBe(true);
  });
});

// refresh() and verify() run INSIDE AuthGuard's session refresh lock (Redis
// LOCK_TTL_MS). Without a bound, a hung/restarting auth MS lets the lock expire
// while the holder is still working, and a parallel request then refreshes with
// an already-rotated token. They must fail fast (-> the guard's 503, session kept).
describe('AuthClientService — bounded in-lock RPCs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['refresh', 'verify'] as const)(
    '%s() rejects with a TimeoutError after IN_LOCK_RPC_TIMEOUT_MS when the auth MS never answers',
    async (method) => {
      vi.useFakeTimers();
      const send = vi.fn(() => NEVER);
      const service = new AuthClientService({ send } as unknown as ClientProxy);

      const settled = service[method]('tok').then(
        () => 'resolved',
        (err: unknown) => err,
      );
      await vi.advanceTimersByTimeAsync(IN_LOCK_RPC_TIMEOUT_MS + 1);

      expect(await settled).toBeInstanceOf(TimeoutError);
    },
  );

  it('does not impose that timeout on slow-by-nature calls like login()', async () => {
    vi.useFakeTimers();
    const send = vi.fn(() => NEVER);
    const service = new AuthClientService({ send } as unknown as ClientProxy);
    let settled = false;
    void service.login('a@x.com', 'pw').then(
      () => (settled = true),
      () => (settled = true),
    );

    await vi.advanceTimersByTimeAsync(IN_LOCK_RPC_TIMEOUT_MS * 3);

    expect(settled).toBe(false);
  });
});
