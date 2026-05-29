import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    buildTransportMS('PAYMENT'),
  );
  await app.listen();
}

bootstrap()
  .then(() => {
    const logger = new Logger('Payment-Bootstrap');
    logger.log(
      `Payment MS Bootstrap completed: transport=${process.env.PAYMENT_TRANSPORT ?? 'tcp'} host=${process.env.PAYMENT_HOST ?? '127.0.0.1'} port=${process.env.PAYMENT_PORT ?? '4003'}`,
    );
  })
  .catch((err) => {
    new Logger('Payment-Bootstrap').error(
      'Payment MS bootstrap failed',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  });
