import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FakeDBStrategy } from '@icore/shared';
import { D1DbModule, D1_DB_REQUIRED_ENV } from '../d1-db.module';
import { D1DBStrategy } from '../d1-db.strategy';

let ENV: Record<string, string | undefined> = {};
@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: { get: (k: string) => ENV[k], getOrThrow: (k: string) => ENV[k] },
    },
  ],
  exports: [ConfigService],
})
class StubConfigModule {}

const compile = () =>
  Test.createTestingModule({
    imports: [StubConfigModule, D1DbModule.forRoot('.env')],
  }).compile();

describe('D1DbModule', () => {
  it('declares its required env', () => {
    expect(D1_DB_REQUIRED_ENV).toEqual(['D1_ACCOUNT_ID', 'D1_DATABASE_ID', 'D1_API_TOKEN']);
  });

  it('provides a real D1DBStrategy when env present', async () => {
    ENV = { D1_ACCOUNT_ID: 'acc', D1_DATABASE_ID: 'db', D1_API_TOKEN: 'tok' };
    const ref = await compile();
    expect(ref.get('DBStrategy')).toBeInstanceOf(D1DBStrategy);
  });

  it('falls back to FakeDBStrategy when env is missing outside production', async () => {
    ENV = {};
    const ref = await compile();
    expect(ref.get('DBStrategy')).toBeInstanceOf(FakeDBStrategy);
  });
});
