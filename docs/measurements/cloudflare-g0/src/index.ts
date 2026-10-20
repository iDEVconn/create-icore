import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
// @ts-ignore - provided by the workerd runtime
import { httpServerHandler } from 'cloudflare:node';
import { CanaryDep, CanaryService, G0Controller } from './canary';

@Module({ controllers: [G0Controller], providers: [CanaryDep, CanaryService] })
class G0Module {}

const PORT = 3000;
const handler = httpServerHandler({ port: PORT });

// Bootstrap lazily on the first request (memoized) so global scope stays cheap and inside
// the 1 s startup limit; the cost of the first request is what G0 measures.
let ready: Promise<void> | undefined;
function boot(): Promise<void> {
  return (async () => {
    const app = await NestFactory.create(G0Module, { logger: ['error', 'warn'] });
    await app.listen(PORT);
  })();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    await (ready ??= boot());
    return handler.fetch(request, env, ctx);
  },
};
