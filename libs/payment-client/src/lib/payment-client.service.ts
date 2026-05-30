import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type {
  CaptureResult,
  CreateOrderInput,
  OrderResult,
  RequestOptions,
} from '@idevconn/payment';
import { PAYMENT_CLIENT } from './payment-client.tokens';

@Injectable()
export class PaymentClientService {
  constructor(@Inject(PAYMENT_CLIENT) private readonly client: ClientProxy) {}

  createOrder(
    provider: string,
    input: CreateOrderInput,
    options?: RequestOptions,
  ): Promise<OrderResult> {
    return firstValueFrom(
      this.client.send<OrderResult>('payment.createOrder', { provider, input, options }),
    );
  }

  captureOrder(
    provider: string,
    orderId: string,
    options?: RequestOptions,
  ): Promise<CaptureResult> {
    return firstValueFrom(
      this.client.send<CaptureResult>('payment.captureOrder', { provider, orderId, options }),
    );
  }

  listProviders(): Promise<string[]> {
    return firstValueFrom(this.client.send<string[]>('payment.providers', {}));
  }
}
