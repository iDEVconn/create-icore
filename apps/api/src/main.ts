import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

async function bootstrap() {
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

  const port = Number(process.env.PORT_API ?? 3001);
  await app.listen(port);
  Logger.log(`Gateway listening on http://localhost:${port}/api`);
  Logger.log(`Swagger UI: http://localhost:${port}/api/docs`);
}

bootstrap();
