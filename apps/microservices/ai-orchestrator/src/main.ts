import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { bootstrapMicroservice, buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

void bootstrapMicroservice(
  'AI',
  () => NestFactory.createMicroservice<MicroserviceOptions>(AppModule, buildTransportMS('AI')),
  new Logger('Ai-Bootstrap'),
);
