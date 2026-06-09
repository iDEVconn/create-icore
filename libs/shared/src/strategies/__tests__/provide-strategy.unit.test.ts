import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildStrategyWithFallback } from '../provide-strategy.js';

const cfgFrom = (env: Record<string, string | undefined>) => ({
  get: (k: string) => env[k],
});

afterEach(() => {
  delete process.env.NODE_ENV;
  vi.restoreAllMocks();
});

describe('buildStrategyWithFallback', () => {
  it('returns the built strategy when all required env is present', () => {
    const result = buildStrategyWithFallback({
      service: 'auth MS',
      provider: 'supabase',
      requiredEnv: ['A', 'B'],
      cfg: cfgFrom({ A: '1', B: '2' }),
      envPath: '.env',
      build: () => 'REAL',
      fake: () => 'FAKE',
    });
    expect(result).toBe('REAL');
  });

  it('returns the fake (dev) when required env is missing', () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = buildStrategyWithFallback({
      service: 'auth MS',
      provider: 'supabase',
      requiredEnv: ['A', 'B'],
      cfg: cfgFrom({ A: '1' }),
      envPath: '.env',
      build: () => 'REAL',
      fake: () => 'FAKE',
    });
    expect(result).toBe('FAKE');
  });

  it('throws (prod) when required env is missing', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      buildStrategyWithFallback({
        service: 'auth MS',
        provider: 'supabase',
        requiredEnv: ['A', 'B'],
        cfg: cfgFrom({}),
        envPath: '.env',
        build: () => 'REAL',
        fake: () => 'FAKE',
      }),
    ).toThrow();
  });

  it('falls back when build() throws despite present env', () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = buildStrategyWithFallback({
      service: 'auth MS',
      provider: 'supabase',
      requiredEnv: ['A'],
      cfg: cfgFrom({ A: '1' }),
      envPath: '.env',
      build: () => {
        throw new Error('bad url');
      },
      fake: () => 'FAKE',
    });
    expect(result).toBe('FAKE');
  });
});
