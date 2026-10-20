import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthController } from '../../../../apps/api/src/app/auth/auth.controller';
import { AuthGuard } from '../../../../apps/api/src/app/auth/auth.guard';
import { CsrfGuard } from '../../../../apps/api/src/app/http/csrf.guard';
import { AbilitiesModule } from '../../../../apps/api/src/app/abilities/abilities.module';
import { ProfileModule } from '../../../../apps/api/src/app/profile/profile.module';
import { SessionModule } from '../../../../apps/api/src/app/session/session.module';
import { CanaryDep, CanaryService, G0Controller } from './canary';
import { SliceAuthClientModule } from './slice-auth-client.module';
import { ProbesController } from './probes.controller';
import { SliceProbesController } from './slice-probes.controller';

// Mirrors apps/api's AppModule + AuthModule, minus everything the measured routes do not
// touch (storage, notes, features). Real: ConfigModule, ThrottlerModule setup, AuthController,
// AuthGuard, CsrfGuard, ThrottlerGuard, SessionModule, AbilitiesModule, ProfileModule.
// Substituted: AuthClientModule.forRoot() -> SliceAuthClientModule (in-process transport).
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), 'apps/api/.env'), join(process.cwd(), '.env')],
    }),
    // Same two named throttlers as apps/api. G0_THROTTLE_LIMIT (default 10, the real value) is
    // raised through a wrangler var for measurement runs only, because both named throttlers
    // apply to every route and would otherwise answer 429 after 10 requests a minute.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const limit = Number(cfg.get('G0_THROTTLE_LIMIT') ?? 10);
        return [
          { name: 'auth-burst', ttl: seconds(60), limit },
          { name: 'ai-burst', ttl: seconds(60), limit },
        ];
      },
    }),
    SliceAuthClientModule,
    SessionModule,
    AbilitiesModule,
    ProfileModule,
  ],
  controllers: [AuthController, G0Controller, SliceProbesController, ProbesController],
  providers: [
    CanaryDep,
    CanaryService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class G0Module {}
