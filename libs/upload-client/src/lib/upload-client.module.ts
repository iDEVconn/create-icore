import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { UploadClientService } from './upload-client.service';

import { UPLOAD_CLIENT } from './upload-client.tokens';

// One DynamicModule object for the whole process: Nest dedupes a dynamic module by identity of its
// metadata, and the registerAsync factory below is a fresh function per call, so two forRoot() calls
// (REST and GraphQL surfaces of one gateway) used to yield two modules, two TCP clients.
let shared: DynamicModule | undefined;

@Module({})
export class UploadClientModule {
  static forRoot(): DynamicModule {
    shared ??= {
      module: UploadClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: UPLOAD_CLIENT,
            useFactory: () => buildTransport('UPLOAD'),
          },
        ]),
      ],
      providers: [UploadClientService],
      exports: [UploadClientService],
    };
    return shared;
  }
}
