import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { AbilitiesModule } from './abilities/abilities.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'auth-burst', ttl: seconds(60), limit: 10 }]),
    AuthModule,
    AbilitiesModule,
    ProfileModule,
  ],
})
export class AppModule {}
