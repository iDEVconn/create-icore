import { describe, expect, it, vi } from 'vitest';
import {
  PaymentRegistry,
  type CaptureResult,
  type OrderResult,
  type PaymentStrategy,
} from '@idevconn/payment';
import { PaymentController } from '../payment.controller';

function makeStrategy(name: string): PaymentStrategy & {
  createOrder: ReturnType<typeof vi.fn>;
  captureOrder: ReturnType<typeof vi.fn>;
} {
  const order: OrderResult = { orderId: 'o1', status: 'CREATED', approveUrl: 'http://pay' };
  const capture: CaptureResult = { orderId: 'o1', status: 'COMPLETED' };
  return {
    name,
    createOrder: vi.fn().mockResolvedValue(order),
    captureOrder: vi.fn().mockResolvedValue(capture),
  };
}

describe('PaymentController', () => {
  function fixture() {
    const paypal = makeStrategy('paypal');
    const registry = new PaymentRegistry({ paypal });
    return { registry, paypal, controller: new PaymentController(registry) };
  }

  it('createOrder forwards to the named strategy', async () => {
    const { paypal, controller } = fixture();
    const result = await controller.createOrder({
      provider: 'paypal',
      input: { amount: '9.99', currency: 'USD' },
    });
    expect(paypal.createOrder).toHaveBeenCalledWith({ amount: '9.99', currency: 'USD' }, undefined);
    expect(result.orderId).toBe('o1');
  });

  it('captureOrder forwards to the named strategy', async () => {
    const { paypal, controller } = fixture();
    const result = await controller.captureOrder({ provider: 'paypal', orderId: 'o1' });
    expect(paypal.captureOrder).toHaveBeenCalledWith('o1', undefined);
    expect(result.status).toBe('COMPLETED');
  });

  it('listProviders returns the registry contents', () => {
    const { controller } = fixture();
    expect(controller.listProviders()).toEqual(['paypal']);
  });

  it('rejects unknown providers via the registry error path', async () => {
    const { controller } = fixture();
    await expect(
      controller.createOrder({
        provider: 'stripe',
        input: { amount: '1.00', currency: 'USD' },
      }),
    ).rejects.toThrow();
  });
});
