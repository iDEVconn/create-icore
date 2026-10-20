import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FakeDBStrategy } from '@icore/shared';
import { D1DbModule, D1_DB_REQUIRED_ENV } from '../d1-db.module';
import { D1DBStrategy } from '../d1-db.strategy';
import { D1_DATABASE_BINDING, type D1DatabaseLike } from '../d1-binding-client';
import { createFakeD1Binding } from '../testing/fake-d1-binding';

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

const bindingModule = (binding: D1DatabaseLike) => {
  @Global()
  @Module({
    providers: [{ provide: D1_DATABASE_BINDING, useValue: binding }],
    exports: [D1_DATABASE_BINDING],
  })
  class StubBindingModule {}
  return StubBindingModule;
};

const compile = (binding?: D1DatabaseLike) =>
  Test.createTestingModule({
    imports: [
      StubConfigModule,
      ...(binding ? [bindingModule(binding)] : []),
      D1DbModule.forRoot('.env'),
    ],
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

  it('uses the Workers binding with no env at all', async () => {
    ENV = {};
    const binding = createFakeD1Binding();
    const ref = await compile(binding);
    const db = ref.get('DBStrategy');
    expect(db).toBeInstanceOf(D1DBStrategy);
    await db.set('c', 'id1', { name: 'x' });
    expect(binding.calls.length).toBeGreaterThan(0);
  });

  it('prefers the binding over REST env when both exist', async () => {
    ENV = { D1_ACCOUNT_ID: 'acc', D1_DATABASE_ID: 'db', D1_API_TOKEN: 'tok' };
    const binding = createFakeD1Binding();
    const ref = await compile(binding);
    await ref.get('DBStrategy').set('c', 'id1', { name: 'x' });
    expect(binding.calls.length).toBeGreaterThan(0);
  });

  it('falls back to FakeDBStrategy when env is missing outside production', async () => {
    ENV = {};
    const ref = await compile();
    expect(ref.get('DBStrategy')).toBeInstanceOf(FakeDBStrategy);
  });
});
