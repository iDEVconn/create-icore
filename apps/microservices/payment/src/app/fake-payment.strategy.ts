import {
  PaymentError,
  type CaptureResult,
  type CreateOrderInput,
  type OrderResult,
  type PaymentStrategy,
  type RequestOptions,
} from '@idevconn/payment';

export class FakePaymentStrategy implements PaymentStrategy {
  constructor(readonly name: string) {}

  createOrder(_input: CreateOrderInput, _options?: RequestOptions): Promise<OrderResult> {
    return Promise.reject(this.notConfigured());
  }

  captureOrder(_orderId: string, _options?: RequestOptions): Promise<CaptureResult> {
    return Promise.reject(this.notConfigured());
  }

  private notConfigured(): PaymentError {
    return new PaymentError(
      'PROVIDER_ERROR',
      503,
      `Payment provider "${this.name}" is not configured (missing credentials)`,
    );
  }
}
