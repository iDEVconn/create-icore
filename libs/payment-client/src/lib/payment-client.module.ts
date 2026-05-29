import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { PaymentClientService } from './payment-client.service';

export const PAYMENT_CLIENT = 'PAYMENT_CLIENT';

@Module({})
export class PaymentClientModule {
  static forRoot(): DynamicModule {
    return {
      module: PaymentClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: PAYMENT_CLIENT,
            useFactory: () => buildTransport('PAYMENT'),
          },
        ]),
      ],
      providers: [PaymentClientService],
      exports: [PaymentClientService],
    };
  }
}
