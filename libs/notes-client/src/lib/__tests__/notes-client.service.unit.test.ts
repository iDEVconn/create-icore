import type { ClientProxy } from '@nestjs/microservices';
import { EMPTY } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { NotesClientService } from '../notes-client.service';

// The notes microservice's `notes.delete` handler returns nothing, so the transport completes the
// reply without emitting a value. firstValueFrom() rejects that with EmptyError ("no elements in
// sequence") although the note was deleted: the caller must see success.
describe('NotesClientService.delete', () => {
  it('resolves when the microservice replies without a value', async () => {
    const client = { send: () => EMPTY } as unknown as ClientProxy;
    await expect(new NotesClientService(client).delete('n1')).resolves.toBeUndefined();
  });
});
