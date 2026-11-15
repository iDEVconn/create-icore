import { Module } from '@nestjs/common';
import { AuthClientModule } from '@icore/auth-client';
import { ProfileController } from './profile.controller';
import { ProfileGatewayService } from './profile-gateway.service';

@Module({
  imports: [AuthClientModule.forRoot()],
  controllers: [ProfileController],
  providers: [ProfileGatewayService],
  exports: [ProfileGatewayService],
})
export class ProfileModule {}
