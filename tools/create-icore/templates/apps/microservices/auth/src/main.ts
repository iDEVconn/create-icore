import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    buildTransportMS('AUTH'),
  );
  await app.listen();
}

bootstrap()
  .then(() => {
    const logger = new Logger('Auth-Bootstrap');
    logger.log(
      `Auth MS Bootstrap completed: transport=${process.env.AUTH_TRANSPORT ?? 'tcp'} host=${process.env.AUTH_HOST ?? '127.0.0.1'} port=${process.env.AUTH_PORT ?? '4001'}`,
    );
  })
  .catch((err) => {
    new Logger('Auth-Bootstrap').error(
      'Auth MS bootstrap failed',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  });
