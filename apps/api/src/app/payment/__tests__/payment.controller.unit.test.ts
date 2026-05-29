import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PaymentClientService } from '@icore/payment-client';
import { PaymentController } from '../payment.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function makeClient(): PaymentClientService {
  return {
    createOrder: vi
      .fn()
      .mockResolvedValue({ orderId: 'o1', status: 'CREATED', approveUrl: 'http://pay' }),
    captureOrder: vi.fn().mockResolvedValue({ orderId: 'o1', status: 'COMPLETED' }),
    listProviders: vi.fn().mockResolvedValue(['paypal']),
  } as unknown as PaymentClientService;
}

function makeReq(headers: Record<string, string> = {}) {
  return {
    header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
  } as unknown as import('express').Request;
}

describe('PaymentController (gateway)', () => {
  it('createOrder forwards to the configured provider', async () => {
    const client = makeClient();
    const controller = new PaymentController(client, makeConfig({ PAYMENT_PROVIDER: 'paypal' }));
    const result = await controller.createOrder({ amount: '9.99', currency: 'USD' }, makeReq());
    expect(client.createOrder).toHaveBeenCalledWith(
      'paypal',
      { amount: '9.99', currency: 'USD' },
      undefined,
    );
    expect(result.orderId).toBe('o1');
  });

  it('createOrder forwards Idempotency-Key header as RequestOptions', async () => {
    const client = makeClient();
    const controller = new PaymentController(client, makeConfig({}));
    await controller.createOrder(
      { amount: '1.00', currency: 'USD' },
      makeReq({ 'Idempotency-Key': 'k1' }),
    );
    expect(client.createOrder).toHaveBeenCalledWith(
      'paypal',
      { amount: '1.00', currency: 'USD' },
      { idempotencyKey: 'k1' },
    );
  });

  it('capture forwards orderId to the configured provider', async () => {
    const client = makeClient();
    const controller = new PaymentController(client, makeConfig({}));
    await controller.capture('o1', makeReq());
    expect(client.captureOrder).toHaveBeenCalledWith('paypal', 'o1', undefined);
  });

  it('list returns the providers from the MS', async () => {
    const client = makeClient();
    const controller = new PaymentController(client, makeConfig({}));
    expect(await controller.list()).toEqual(['paypal']);
  });
});
