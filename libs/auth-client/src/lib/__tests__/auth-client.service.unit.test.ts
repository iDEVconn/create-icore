import { describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthClientService } from '../auth-client.service';

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

  it('passes through unrecognized RPC errors unchanged', async () => {
    const send = vi.fn(() => throwError(() => new RpcException('some_unmapped_error')));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    await expect(service.login('a@x.com', 'pw')).rejects.not.toBeInstanceOf(UnauthorizedException);
  });
});
