import { Logger, type FactoryProvider } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DurableObjectSessionStore, InMemorySessionStore, type SessionStore } from '@icore/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionStoreProvider } from '../session-store.provider';

const rawFactory = (sessionStoreProvider as FactoryProvider<SessionStore>).useFactory;
const factory = (config: ConfigService, namespace?: unknown) =>
  (rawFactory as (c: ConfigService, n?: unknown) => SessionStore)(config, namespace);
const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

describe('sessionStoreProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to redis: without SESSION_REDIS_URL it refuses to boot and points at SESSION_STORE=memory', () => {
    expect(() => factory(cfg({}))).toThrow(/SESSION_REDIS_URL is required.*SESSION_STORE=memory/s);
  });

  it('rejects an unknown SESSION_STORE value and names the accepted ones', () => {
    expect(() => factory(cfg({ SESSION_STORE: 'dynamodb' }))).toThrow(/redis.*memory/s);
  });

  it('memory (development): returns an InMemorySessionStore and warns loudly', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const store = factory(cfg({ SESSION_STORE: 'memory' }));
    expect(store).toBeInstanceOf(InMemorySessionStore);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(
      /restart logs everyone out.*ONE gateway instance/s,
    );
    (store as InMemorySessionStore).close();
  });

  it('memory in production without SESSION_STORE_ALLOW_MEMORY=true refuses to boot', () => {
    expect(() => factory(cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production' }))).toThrow(
      /SESSION_STORE_ALLOW_MEMORY=true/,
    );
  });

  it.each(['1', 'yes', 'TRUE', ''])(
    'only the exact string "true" acknowledges memory in production (got %j)',
    (ack) => {
      expect(() =>
        factory(
          cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production', SESSION_STORE_ALLOW_MEMORY: ack }),
        ),
      ).toThrow(/SESSION_STORE_ALLOW_MEMORY=true/);
    },
  );

  it('memory in production WITH the acknowledgment boots (and still warns)', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const store = factory(
      cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production', SESSION_STORE_ALLOW_MEMORY: 'true' }),
    );
    expect(store).toBeInstanceOf(InMemorySessionStore);
    expect(warn).toHaveBeenCalled();
    (store as InMemorySessionStore).close();
  });

  describe('durable-object (Cloudflare Workers host)', () => {
    const namespace = { idFromName: (n: string) => n, get: () => ({}) };

    it('builds a DurableObjectSessionStore over the provided namespace', () => {
      expect(factory(cfg({ SESSION_STORE: 'durable-object' }), namespace)).toBeInstanceOf(
        DurableObjectSessionStore,
      );
    });

    it('refuses to boot without the namespace binding, naming it', () => {
      expect(() => factory(cfg({ SESSION_STORE: 'durable-object' }))).toThrow(
        /SESSION_DO_NAMESPACE|Durable Object/,
      );
    });

    it('does not need Redis or the memory acknowledgment', () => {
      expect(() =>
        factory(cfg({ SESSION_STORE: 'durable-object', NODE_ENV: 'production' }), namespace),
      ).not.toThrow();
    });
  });
});
