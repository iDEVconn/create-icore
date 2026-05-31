import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { bootstrapMicroservice, buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

void bootstrapMicroservice(
  'UPLOAD',
  () => NestFactory.createMicroservice<MicroserviceOptions>(AppModule, buildTransportMS('UPLOAD')),
  new Logger('Upload-Bootstrap'),
);
