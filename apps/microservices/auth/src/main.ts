import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    buildTransport('AUTH') as unknown as MicroserviceOptions,
  );
  await app.listen();
  console.log(`auth microservice up on transport ${process.env.AUTH_TRANSPORT ?? 'tcp'}`);
}
bootstrap();
