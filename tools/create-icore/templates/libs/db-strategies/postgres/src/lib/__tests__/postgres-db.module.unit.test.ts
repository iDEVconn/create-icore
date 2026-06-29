import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PostgresDbModule, POSTGRES_DB_REQUIRED_ENV } from '../postgres-db.module.js';
import { PostgresDBStrategy } from '../postgres-db.strategy.js';

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

describe('PostgresDbModule', () => {
  it('declares its required env', () => {
    expect(POSTGRES_DB_REQUIRED_ENV).toEqual(['POSTGRES_URL']);
  });

  it('provides a real PostgresDBStrategy under DBStrategy when env present', async () => {
    ENV = { POSTGRES_URL: 'postgresql://user:pass@localhost:5432/test' };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, PostgresDbModule.forRoot('.env')],
    }).compile();
    expect(ref.get('DBStrategy')).toBeInstanceOf(PostgresDBStrategy);
  });
});
