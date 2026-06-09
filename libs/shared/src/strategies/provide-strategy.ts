import { missingEnv, formatEnvBanner } from '../env';

export interface StrategyConfigReader {
  get(key: string): string | undefined;
}

export interface BuildStrategyOpts<T> {
  service: string;
  provider: string;
  requiredEnv: string[];
  cfg: StrategyConfigReader;
  envPath: string;
  build: () => T;
  fake: () => T;
}

/**
 * Build a concrete strategy, or fall back to the in-memory fake. Centralises the
 * dev-warns-and-fakes / prod-fails-fast behavior that used to live inline in each
 * microservice app.module useFactory.
 */
export function buildStrategyWithFallback<T>(opts: BuildStrategyOpts<T>): T {
  const missing = missingEnv((k) => opts.cfg.get(k), opts.requiredEnv);

  const fallback = (reason?: string): T => {
    const banner = formatEnvBanner({
      service: opts.service,
      provider: opts.provider,
      missing,
      envPath: opts.envPath,
      reason,
    });
    if (process.env['NODE_ENV'] === 'production') throw new Error(banner);
    console.warn(banner);
    return opts.fake();
  };

  if (missing.length > 0) return fallback();
  try {
    return opts.build();
  } catch (err) {
    return fallback(err instanceof Error ? err.message : String(err));
  }
}
