import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { UploadClientService } from './upload-client.service';

export const UPLOAD_CLIENT = 'UPLOAD_CLIENT';

@Module({})
export class UploadClientModule {
  static forRoot(): DynamicModule {
    return {
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
  }
}
