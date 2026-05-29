import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { NotesClientService } from './notes-client.service';

export const NOTES_CLIENT = 'NOTES_CLIENT';

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
