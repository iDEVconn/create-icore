import 'reflect-metadata';
import { CanActivate, Controller, ExecutionContext, Injectable, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import {
  ClientProxy,
  ClientsModule,
  MessagePattern,
  Payload,
  RpcException,
  type MicroserviceOptions,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTransport, buildTransportMS } from '../transport';

// The same wiring the gateway and a microservice use: ClientsModule.registerAsync(buildTransport)
// on one side, NestFactory.createMicroservice(buildTransportMS) with its own global guard on the
// other — here selected with E2E_TRANSPORT=local.

@Injectable()
class OkGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const data = context.switchToRpc().getData() as { ok?: boolean };
    if (!data?.ok) throw new RpcException('denied');
    return true;
  }
}

@Controller()
class PingController {
  @MessagePattern('ping')
  ping(@Payload() data: { ok: boolean; n: number }) {
    return { pong: data.n };
  }
}

@Module({ controllers: [PingController], providers: [{ provide: APP_GUARD, useClass: OkGuard }] })
class MsModule {}

describe('local transport through ClientsModule and createMicroservice', () => {
  let ms: { close: () => Promise<void> };
  let client: ClientProxy;
  let closeClient: () => Promise<void>;

  beforeAll(async () => {
    process.env['E2E_TRANSPORT'] = 'local';
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(MsModule, {
      ...buildTransportMS('E2E'),
      logger: false,
    } as MicroserviceOptions);
    await app.listen();
    ms = app;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ClientsModule.registerAsync([
          { name: 'E2E_CLIENT', useFactory: () => buildTransport('E2E') },
        ]),
      ],
    }).compile();
    client = moduleRef.get<ClientProxy>('E2E_CLIENT');
    closeClient = () => moduleRef.close();
  });

  afterAll(async () => {
    await closeClient();
    await ms.close();
    delete process.env['E2E_TRANSPORT'];
  });

  it('round-trips a message through the real client module and server', async () => {
    await expect(firstValueFrom(client.send('ping', { ok: true, n: 3 }))).resolves.toEqual({
      pong: 3,
    });
  });

  it("runs the microservice's global APP_GUARD over the local transport", async () => {
    await expect(firstValueFrom(client.send('ping', { ok: false, n: 1 }))).rejects.toEqual({
      status: 'error',
      message: 'denied',
    });
  });
});
