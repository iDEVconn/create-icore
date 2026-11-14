import type { ClientProxy } from '@nestjs/microservices';
import { EMPTY } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { UploadClientService } from '../upload-client.service';

// `storage.remove` replies without a value (the handler returns nothing): the transport completes
// without emitting, and firstValueFrom() would reject with EmptyError after a successful removal.
describe('UploadClientService.remove', () => {
  it('resolves when the microservice replies without a value', async () => {
    const client = { send: () => EMPTY } as unknown as ClientProxy;
    await expect(
      new UploadClientService(client).remove('u1', { bucket: 'b', path: 'u1/f.txt' }),
    ).resolves.toBeUndefined();
  });
});
