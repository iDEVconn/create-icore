import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { bootstrapMicroservice, buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

void bootstrapMicroservice(
  'AUTH',
  () => NestFactory.createMicroservice<MicroserviceOptions>(AppModule, buildTransportMS('AUTH')),
  new Logger('Auth-Bootstrap'),
);
