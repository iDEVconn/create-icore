import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  PaymentRegistry,
  type CaptureResult,
  type CreateOrderInput,
  type OrderResult,
  type RequestOptions,
} from '@idevconn/payment';

@Controller()
export class PaymentController {
  constructor(private readonly registry: PaymentRegistry) {}

  @MessagePattern('payment.createOrder')
  createOrder(
    @Payload()
    payload: {
      provider: string;
      input: CreateOrderInput;
      options?: RequestOptions;
    },
  ): Promise<OrderResult> {
    return this.registry.createOrder(payload.provider, payload.input, payload.options);
  }

  @MessagePattern('payment.captureOrder')
  captureOrder(
    @Payload()
    payload: {
      provider: string;
      orderId: string;
      options?: RequestOptions;
    },
  ): Promise<CaptureResult> {
    return this.registry.captureOrder(payload.provider, payload.orderId, payload.options);
  }

  @MessagePattern('payment.providers')
  listProviders(): string[] {
    return this.registry.list();
  }
}
