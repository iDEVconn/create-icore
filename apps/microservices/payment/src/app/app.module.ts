import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentRegistry, PaypalStrategy, createPayment } from '@idevconn/payment';
import { PaymentController } from './payment.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/payment/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [PaymentController],
  providers: [
    {
      provide: PaymentRegistry,
      useFactory: (cfg: ConfigService) => {
        const provider = cfg.get<string>('PAYMENT_PROVIDER') ?? 'paypal';
        if (provider === 'paypal') {
          return createPayment({
            strategies: {
              paypal: new PaypalStrategy({
                clientId: cfg.getOrThrow<string>('PAYPAL_CLIENT_ID'),
                secret: cfg.getOrThrow<string>('PAYPAL_CLIENT_SECRET'),
                environment: cfg.get<'sandbox' | 'live'>('PAYPAL_ENVIRONMENT') ?? 'sandbox',
              }),
            },
          });
        }
        throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
