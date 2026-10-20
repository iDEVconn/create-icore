import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule as AuthMsModule } from '../../../../apps/microservices/auth/src/app/app.module';
import { G0Module } from './g0.module';
import { LocalServer } from './local-transport';

export const PORT = 3000;

// Auth microservice (real AppModule, fake auth strategy fallback) and the gateway (the
// slice) run as two Nest applications in this isolate, like the design in the spec.
export async function bootstrap(): Promise<void> {
  console.log('g0: bootstrap start');
  const ms = await NestFactory.createMicroservice(AuthMsModule, {
    strategy: new LocalServer('AUTH'),
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  console.log('g0: auth ms created');
  await ms.listen();
  console.log('g0: auth ms listening');

  const app = await NestFactory.create<NestExpressApplication>(G0Module, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  console.log('g0: gateway created');
  app.setGlobalPrefix('api', { exclude: [{ path: 'g0/{*path}', method: RequestMethod.ALL }] });
  app.use(cookieParser());
  await app.listen(PORT);
  console.log('g0: gateway listening');
}
