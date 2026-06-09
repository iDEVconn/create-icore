import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { buildStrategyWithFallback, FakeAuthStrategy } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { SupabaseAuthStrategy } from './supabase-auth.strategy';

export const SUPABASE_AUTH_REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

@Module({})
export class SupabaseAuthModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: SupabaseAuthModule,
      providers: [
        {
          provide: 'AuthStrategy',
          useFactory: (cfg: ConfigService): AuthStrategy =>
            buildStrategyWithFallback<AuthStrategy>({
              service: 'auth MS',
              provider: 'supabase',
              requiredEnv: SUPABASE_AUTH_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new SupabaseAuthStrategy({
                  client: createClient(
                    cfg.getOrThrow<string>('SUPABASE_URL'),
                    cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
                    { auth: { autoRefreshToken: false, persistSession: false } },
                  ),
                }),
              fake: () => new FakeAuthStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['AuthStrategy'],
    };
  }
}
