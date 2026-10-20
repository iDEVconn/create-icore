import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SqliteDbModule, SQLITE_DB_REQUIRED_ENV } from '../sqlite-db.module.js';
import { SqliteDBStrategy } from '../sqlite-db.strategy.js';

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

describe('SqliteDbModule', () => {
  it('declares its required env (empty since no remote creds needed)', () => {
    expect(SQLITE_DB_REQUIRED_ENV).toEqual([]);
  });

  it('provides a real SqliteDBStrategy under DBStrategy', async () => {
    ENV = { SQLITE_DB_PATH: ':memory:' };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, SqliteDbModule.forRoot('.env')],
    }).compile();
    const strategy = ref.get('DBStrategy');
    expect(strategy).toBeInstanceOf(SqliteDBStrategy);
  });
});
