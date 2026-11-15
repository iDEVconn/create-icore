import { Module } from '@nestjs/common';
import { AuthClientModule } from '@icore/auth-client';
import { ProfileGatewayService } from '../profile-gateway.service';
import { ProfileResolver } from './profile.resolver';

/** GraphQL surface of the profile. Independent of the REST ProfileModule, so it provides the gateway service itself. */
@Module({
  imports: [AuthClientModule.forRoot()],
  providers: [ProfileGatewayService, ProfileResolver],
  exports: [ProfileGatewayService],
})
export class ProfileGraphqlModule {}
