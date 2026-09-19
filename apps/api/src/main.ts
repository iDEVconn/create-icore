import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { formatGatewayBanner } from '@icore/shared';
import { AppModule } from './app/app.module';
import { GATEWAY_SERVICES } from './app/gateway-services';
import { shouldEnableSwagger } from './should-enable-swagger';
import pkg from '@icore/package.json';

const DEFAULT_PORT = 3001;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // Single reverse proxy/load balancer in front of the gateway in production —
  // trust exactly one hop's X-Forwarded-For so express-rate-limit/@nestjs/throttler
  // key on the real client IP instead of the proxy's. `false` in dev (no proxy
  // there), since blindly trusting an untrusted hop count opens an IP-spoofing
  // rate-limit bypass.
  app.set('trust proxy', process.env['NODE_ENV'] === 'production' ? 1 : false);
  app.use(cookieParser());
  app.enableCors({
    origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:4200',
    credentials: true,
  });

  if (shouldEnableSwagger(process.env.NODE_ENV)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('iCore API')
      .setDescription('iCore Gateway HTTP surface')
      .setVersion(pkg.version)
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.API_PORT ?? DEFAULT_PORT);
  await app.listen(port);
}

bootstrap()
  .then(() => {
    const origin = process.env.API_ORIGIN ?? 'http://localhost';
    const port = Number(process.env.API_PORT ?? DEFAULT_PORT);
    new Logger('API-Bootstrap').log(
      formatGatewayBanner({ port, origin, services: GATEWAY_SERVICES }),
    );
  })
  .catch((err) => {
    new Logger('API-Bootstrap').error(
      'Gateway bootstrap failed',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  });
