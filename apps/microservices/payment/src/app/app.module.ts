import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  PaymentRegistry,
  PaypalStrategy,
  createPayment,
  type PaymentStrategy,
} from '@idevconn/payment';
import { missingEnv, formatEnvBanner } from '@icore/shared';
import { PaymentController } from './payment.controller';
import { FakePaymentStrategy } from './fake-payment.strategy';

const ENV_PATH = 'apps/microservices/payment/.env';

const REQUIRED_ENV: Record<string, string[]> = {
  paypal: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
};

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
        const logger = new Logger('PaymentRegistry');
        const provider = (cfg.get<string>('PAYMENT_PROVIDER') ?? 'paypal').trim();
        const keys = REQUIRED_ENV[provider];
        if (!keys) throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);

        const missing = missingEnv((k) => cfg.get<string>(k), keys);

        const buildStrategy = (): PaymentStrategy => {
          if (missing.length > 0) {
            const banner = formatEnvBanner({
              service: 'payment MS',
              provider,
              missing,
              envPath: ENV_PATH,
              headline: `⚠  payment MS — ${provider} credentials missing (payments will fail)`,
            });
            logger.warn(banner);
            return new FakePaymentStrategy(provider);
          }

          return new PaypalStrategy({
            clientId: cfg.getOrThrow<string>('PAYPAL_CLIENT_ID'),
            secret: cfg.getOrThrow<string>('PAYPAL_CLIENT_SECRET'),
            environment: cfg.get<'sandbox' | 'live'>('PAYPAL_ENVIRONMENT') ?? 'sandbox',
          });
        };

        return createPayment({ strategies: { [provider]: buildStrategy() } });
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
