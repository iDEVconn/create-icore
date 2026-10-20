import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { AbilitiesModule } from './abilities/abilities.module';
import { StorageModule } from './storage/storage.module';
import { FeaturesModule } from './features.module';
import { throttlerOptions } from './http/throttler.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), 'apps/api/.env'), join(process.cwd(), '.env')],
    }),
    ThrottlerModule.forRoot(throttlerOptions),
    AuthModule,
    AbilitiesModule,
    ProfileModule,
    StorageModule,
    FeaturesModule,
  ],
})
export class AppModule {}
