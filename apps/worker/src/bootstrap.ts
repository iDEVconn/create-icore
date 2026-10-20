import { Module, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { buildTransportMS } from '@icore/shared';
import { WorkerBindingsModule } from './bindings.module';
import type { WorkerEnv } from './env';
import { createGatewayModule } from './gateway.module';
import { MICROSERVICES } from './hosted-apps';

export const PORT = 3000;

// `abortOnError: false`: Nest's default turns a failed bootstrap into `process.exit(1)`, which
// Workers reports as a canceled request (and the caller could not clear a memoized promise).
const BASE_OPTIONS = { logger: ['error', 'warn'] as ('error' | 'warn')[], abortOnError: false };

function withBindings(env: WorkerEnv, module: Type<unknown>): Type<unknown> {
  @Module({ imports: [WorkerBindingsModule.forEnv(env), module] })
  class HostedMicroservice {}
  return HostedMicroservice;
}

/** Starts every microservice, then the gateway, in this isolate. Throws on the first failure. */
export async function bootstrap(env: WorkerEnv): Promise<void> {
  for (const { prefix, module } of MICROSERVICES) {
    const ms = await NestFactory.createMicroservice<MicroserviceOptions>(
      withBindings(env, module),
      { ...buildTransportMS(prefix), ...BASE_OPTIONS },
    );
    await ms.listen();
  }

  const app = await NestFactory.create<NestExpressApplication>(
    createGatewayModule(env),
    BASE_OPTIONS,
  );
  app.setGlobalPrefix('api');
  // Cloudflare is the single proxy in front of the Worker: key limits on the real client IP.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  await app.listen(PORT);
}
