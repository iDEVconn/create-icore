import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { NotesClientService } from './notes-client.service';

import { NOTES_CLIENT } from './notes-client.tokens';

// One DynamicModule object for the whole process: Nest dedupes a dynamic module by identity of its
// metadata, and the registerAsync factory below is a fresh function per call, so two forRoot() calls
// (REST and GraphQL surfaces of one gateway) used to yield two modules, two TCP clients.
let shared: DynamicModule | undefined;

@Module({})
export class NotesClientModule {
  static forRoot(): DynamicModule {
    shared ??= {
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
    return shared;
  }
}
