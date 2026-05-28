import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    buildTransportMS('UPLOAD'),
  );
  await app.listen();
}

bootstrap()
  .then(() => {
    const logger = new Logger('Upload-Bootstrap');
    logger.log(
      `Upload MS Bootstrap completed: transport=${process.env.UPLOAD_TRANSPORT ?? 'tcp'} host=${process.env.UPLOAD_HOST ?? '127.0.0.1'} port=${process.env.UPLOAD_PORT ?? '4002'}`,
    );
  })
  .catch((err) => {
    new Logger('Upload-Bootstrap').error(
      'Upload MS bootstrap failed',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  });
