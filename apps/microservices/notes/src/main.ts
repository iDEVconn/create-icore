import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { bootstrapMicroservice, buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

void bootstrapMicroservice(
  'NOTES',
  () => NestFactory.createMicroservice<MicroserviceOptions>(AppModule, buildTransportMS('NOTES')),
  new Logger('Notes-Bootstrap'),
);
