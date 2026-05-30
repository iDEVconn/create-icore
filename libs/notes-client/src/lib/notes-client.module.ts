import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { NotesClientService } from './notes-client.service';

import { NOTES_CLIENT } from './notes-client.tokens';

@Module({})
export class NotesClientModule {
  static forRoot(): DynamicModule {
    return {
      module: NotesClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: NOTES_CLIENT,
            useFactory: () => buildTransport('NOTES'),
          },
        ]),
      ],
      providers: [NotesClientService],
      exports: [NotesClientService],
    };
  }
}
