import { Module } from '@nestjs/common';
import { PaymentClientModule } from '@icore/payment-client';
import { PaymentController } from './payment.controller';

@Module({
  imports: [PaymentClientModule.forRoot()],
  controllers: [PaymentController],
})
export class PaymentModule {}
