import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
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
