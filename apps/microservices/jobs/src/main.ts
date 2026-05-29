import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  return app;
}

bootstrap()
  .then(() => {
    new Logger('Jobs-Bootstrap').log('Jobs MS started — workers attached');
  })
  .catch((err) => {
    new Logger('Jobs-Bootstrap').error(
      'Jobs MS bootstrap failed',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  });
