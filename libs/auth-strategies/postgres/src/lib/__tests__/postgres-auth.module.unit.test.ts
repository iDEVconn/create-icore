import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PostgresAuthModule, POSTGRES_AUTH_REQUIRED_ENV } from '../postgres-auth.module.js';
import { PostgresAuthStrategy } from '../postgres-auth.strategy.js';

let ENV: Record<string, string | undefined> = {};

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (k: string) => ENV[k],
        getOrThrow: (k: string) => ENV[k],
      },
    },
  ],
  exports: [ConfigService],
})
class StubConfigModule {}

describe('PostgresAuthModule', () => {
  it('declares its required env', () => {
    expect(POSTGRES_AUTH_REQUIRED_ENV).toEqual(['POSTGRES_URL', 'JWT_SECRET']);
  });

  it('provides a real PostgresAuthStrategy under AuthStrategy when env present', async () => {
    ENV = {
      POSTGRES_URL: 'postgresql://user:pass@localhost:5432/test',
      JWT_SECRET: 'test-secret',
    };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, PostgresAuthModule.forRoot('.env')],
    }).compile();
    expect(ref.get('AuthStrategy')).toBeInstanceOf(PostgresAuthStrategy);
  });
});
