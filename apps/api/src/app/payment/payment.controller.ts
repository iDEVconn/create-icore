import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type {
  CaptureResult,
  CreateOrderInput,
  OrderResult,
  RequestOptions,
} from '@idevconn/payment';
import { PaymentClientService } from '@icore/payment-client';

@ApiBearerAuth()
@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(
    private readonly payments: PaymentClientService,
    private readonly cfg: ConfigService,
  ) {}

  private get defaultProvider(): string {
    return this.cfg.get<string>('PAYMENT_PROVIDER') ?? 'paypal';
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create a payment order' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['amount', 'currency'],
      properties: {
        amount: { type: 'string', example: '9.99' },
        currency: { type: 'string', example: 'USD' },
        referenceId: { type: 'string' },
        returnUrl: { type: 'string' },
        cancelUrl: { type: 'string' },
      },
    },
  })
  createOrder(@Body() body: CreateOrderInput, @Req() req: Request): Promise<OrderResult> {
    const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
    const options: RequestOptions | undefined = idempotencyKey ? { idempotencyKey } : undefined;
    return this.payments.createOrder(this.defaultProvider, body, options);
  }

  @Post('orders/:id/capture')
  @ApiOperation({ summary: 'Capture a previously-created payment order' })
  @ApiParam({ name: 'id' })
  capture(@Param('id') id: string, @Req() req: Request): Promise<CaptureResult> {
    const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
    const options: RequestOptions | undefined = idempotencyKey ? { idempotencyKey } : undefined;
    return this.payments.captureOrder(this.defaultProvider, id, options);
  }

  @Get('providers')
  @ApiOperation({ summary: 'List the payment providers registered on the MS' })
  list(): Promise<string[]> {
    return this.payments.listProviders();
  }
}
