import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import pkg from '@icore/package.json';

const DEFAULT_PORT = 3001;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('iCore API')
    .setDescription('iCore Gateway HTTP surface')
    .setVersion(pkg.version)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT ?? DEFAULT_PORT);
  await app.listen(port);
}

bootstrap().then(() => {
  const logger = new Logger('API-Bootstrap');
  logger.log(
    `API Bootstrap completed successfully: ${process.env.API_ORIGIN ?? 'http://localhost'}:${process.env.API_PORT ?? DEFAULT_PORT}/api`,
  );
  logger.log(
    `Swagger UI: ${process.env.API_ORIGIN ?? 'http://localhost'}:${process.env.API_PORT ?? DEFAULT_PORT}/api/docs`,
  );
});
