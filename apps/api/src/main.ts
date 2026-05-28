import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

async function appBootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('icore API')
    .setDescription('icore gateway HTTP surface')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

appBootstrap().then(() => {
  const logger = new Logger('appBootstrap');
  logger.log(
    `API Bootstrap completed successfully: ${process.env.API_ORIGIN ?? 'http://localhost'}:${process.env.API_PORT ?? '3001'}/api`,
  );
  logger.log(
    `Swagger UI: ${process.env.API_ORIGIN ?? 'http://localhost'}:${process.env.API_PORT ?? '3001'}/api/docs`,
  );
});
