import 'reflect-metadata';
import { Controller, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
  type MicroserviceOptions,
} from '@nestjs/microservices';
import { Observable, firstValueFrom, timeout, TimeoutError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalClientProxy, LocalServer } from '../local-transport';

const seen: unknown[] = [];

@Controller()
class EchoController {
  @MessagePattern('echo')
  echo(@Payload() data: { text: string }) {
    return { echoed: data.text };
  }

  @MessagePattern('rpc.fail')
  rpcFail() {
    throw new RpcException('invalid_credentials');
  }

  @MessagePattern('plain.fail')
  plainFail() {
    throw new Error('boom');
  }

  @MessagePattern('never')
  never() {
    return new Observable(() => undefined); // never emits, never completes
  }

  @MessagePattern('stream')
  stream() {
    return new Observable<number>((subscriber) => {
      subscriber.next(1);
      subscriber.next(2);
      subscriber.complete();
    });
  }

  @EventPattern('noted')
  noted(@Payload() data: unknown) {
    seen.push(data);
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

const started: Array<{ close: () => Promise<void> }> = [];

async function startServer(prefix: string) {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(EchoModule, {
    strategy: new LocalServer(prefix),
    logger: false,
  });
  await app.listen();
  started.push(app);
  return app;
}

afterEach(async () => {
  seen.length = 0;
  while (started.length) await started.pop()!.close();
});

describe('LocalServer + LocalClientProxy', () => {
  it('send returns the handler result', async () => {
    await startServer('T_SEND');
    const client = new LocalClientProxy({ prefix: 'T_SEND' });
    await expect(firstValueFrom(client.send('echo', { text: 'hi' }))).resolves.toEqual({
      echoed: 'hi',
    });
  });

  it('a thrown RpcException reaches the client as { status: "error", message }', async () => {
    await startServer('T_RPC');
    const client = new LocalClientProxy({ prefix: 'T_RPC' });
    await expect(firstValueFrom(client.send('rpc.fail', {}))).rejects.toEqual({
      status: 'error',
      message: 'invalid_credentials',
    });
  });

  it('a plain Error reaches the client as a rejection with a message', async () => {
    await startServer('T_PLAIN');
    const client = new LocalClientProxy({ prefix: 'T_PLAIN' });
    const err = await firstValueFrom(client.send('plain.fail', {})).catch((e) => e);
    expect(err).toBeDefined();
    expect(typeof (err as { message?: unknown }).message).toBe('string');
  });

  it('emit invokes the @EventPattern handler with the payload', async () => {
    await startServer('T_EMIT');
    const client = new LocalClientProxy({ prefix: 'T_EMIT' });
    await firstValueFrom(client.emit('noted', { id: 7 }));
    expect(seen).toEqual([{ id: 7 }]);
  });

  it('a pattern nobody handles rejects with a message naming the pattern and the prefix', async () => {
    await startServer('T_MISSING');
    const client = new LocalClientProxy({ prefix: 'T_MISSING' });
    const err = await firstValueFrom(client.send('does.not.exist', {})).catch((e) => e);
    expect(String((err as Error).message)).toMatch(/does\.not\.exist/);
    expect(String((err as Error).message)).toMatch(/T_MISSING/);
  });

  it('a client created before the server starts reaches it once it listens', async () => {
    const client = new LocalClientProxy({ prefix: 'T_LATE' });
    await startServer('T_LATE');
    await expect(firstValueFrom(client.send('echo', { text: 'late' }))).resolves.toEqual({
      echoed: 'late',
    });
  });

  it('after the server closes, a call rejects instead of hanging', async () => {
    const app = await startServer('T_CLOSED');
    const client = new LocalClientProxy({ prefix: 'T_CLOSED' });
    await app.close();
    started.pop();
    const err = await firstValueFrom(client.send('echo', { text: 'x' }).pipe(timeout(500))).catch(
      (e) => e,
    );
    expect(err).not.toBeInstanceOf(TimeoutError);
    expect(String((err as Error).message)).toMatch(/T_CLOSED/);
  });

  it('two prefixes are isolated', async () => {
    await startServer('T_ONE');
    const other = new LocalClientProxy({ prefix: 'T_TWO' });
    const err = await firstValueFrom(other.send('echo', { text: 'x' })).catch((e) => e);
    expect(String((err as Error).message)).toMatch(/T_TWO/);
  });

  it('a handler that never answers is aborted by rxjs timeout', async () => {
    await startServer('T_NEVER');
    const client = new LocalClientProxy({ prefix: 'T_NEVER' });
    await expect(firstValueFrom(client.send('never', {}).pipe(timeout(50)))).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it('a handler returning an observable that emits twice yields its first value to firstValueFrom', async () => {
    await startServer('T_STREAM');
    const client = new LocalClientProxy({ prefix: 'T_STREAM' });
    await expect(firstValueFrom(client.send('stream', {}))).resolves.toBe(1);
  });
});
