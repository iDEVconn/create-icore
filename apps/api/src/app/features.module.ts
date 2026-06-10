import { Module } from '@nestjs/common';
import { NotesModule } from './notes/notes.module';
import { PaymentModule } from './payment/payment.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [NotesModule, PaymentModule, AdminModule],
})
export class FeaturesModule {}
