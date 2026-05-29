import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    buildTransportMS('NOTES'),
  );
  await app.listen();
}

bootstrap()
  .then(() => {
    const logger = new Logger('Notes-Bootstrap');
    logger.log(
      `Notes MS Bootstrap completed: transport=${process.env.NOTES_TRANSPORT ?? 'tcp'} host=${process.env.NOTES_HOST ?? '127.0.0.1'} port=${process.env.NOTES_PORT ?? '4004'}`,
    );
  })
  .catch((err) => {
    new Logger('Notes-Bootstrap').error(
      'Notes MS bootstrap failed',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  });
