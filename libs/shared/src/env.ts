// Server-side env helpers. NOT exported from ./client (browser-safe entry) —
// generated microservices import these to report which provider credentials
// are missing on startup instead of crashing.

/**
 * Returns the keys whose value is missing or blank.
 * @param get   accessor (e.g. ConfigService.get bound to the MS config)
 * @param keys  env var names required for the selected provider
 */
export function missingEnv(get: (key: string) => string | undefined, keys: string[]): string[] {
  return keys.filter((k) => !get(k)?.trim());
}

/**
 * Builds an eye-catching boxed banner listing the env vars a microservice
 * needs but is missing, so it stands out in the `yarn dev` log noise.
 */
export function formatEnvBanner(opts: {
  service: string;
  provider: string | undefined;
  missing: string[];
  envPath: string;
  reason?: string;
  /** Override the first line. Defaults to the in-memory-fake warning. */
  headline?: string;
}): string {
  const { service, provider, missing, envPath, reason, headline } = opts;
  const lines: string[] = [];
  lines.push(headline ?? `⚠  ${service} — running with an IN-MEMORY FAKE (requests will fail)`);
  lines.push('');
  if (!provider) {
    lines.push(`Provider env var is not set.`);
  } else if (missing.length > 0) {
    lines.push(`"${provider}" needs these env vars, currently missing:`);
    for (const k of missing) lines.push(`  • ${k}`);
  } else if (reason) {
    // Vars are present but invalid (e.g. placeholder URL the SDK rejected).
    lines.push(`"${provider}" failed to initialise:`);
    lines.push(`  ${reason}`);
  }
  lines.push('');
  lines.push(`Set real values in:  ${envPath}`);

  const width = Math.max(...lines.map((l) => l.length), 50);
  const top = `╔═${'═'.repeat(width)}═╗`;
  const bot = `╚═${'═'.repeat(width)}═╝`;
  const body = lines.map((l) => `║ ${l.padEnd(width)} ║`).join('\n');
  return `\n${top}\n${body}\n${bot}`;
}

/**
 * Returns a boxed startup info banner listing every MS the gateway will
 * connect to, reading the current transport env vars.
 */
export function formatGatewayBanner(opts: {
  port: number;
  origin: string;
  services: Array<{ name: string; prefix: string }>;
}): string {
  const { port, origin, services } = opts;
  const lines: string[] = [];
  lines.push(`Gateway listening on  ${origin}:${port}/api`);
  lines.push(`Swagger UI            ${origin}:${port}/api/docs`);
  lines.push('');
  lines.push('Microservice transports:');
  for (const { name, prefix } of services) {
    const kind = (process.env[`${prefix}_TRANSPORT`] ?? 'tcp').toLowerCase();
    let target: string;
    if (kind === 'tcp') {
      const host = process.env[`${prefix}_HOST`] ?? '127.0.0.1';
      const port_ = process.env[`${prefix}_PORT`] ?? '?';
      target = `tcp  ${host}:${port_}`;
    } else if (kind === 'redis') {
      target = `redis  ${process.env[`${prefix}_REDIS_URL`] ?? '(REDIS_URL not set)'}`;
    } else if (kind === 'nats') {
      target = `nats  ${process.env[`${prefix}_NATS_URL`] ?? '(NATS_URL not set)'}`;
    } else {
      target = kind;
    }
    lines.push(`  ${name.padEnd(10)} →  ${target}`);
  }

  const width = Math.max(...lines.map((l) => l.length), 50);
  const top = `╔═${'═'.repeat(width)}═╗`;
  const bot = `╚═${'═'.repeat(width)}═╝`;
  const body = lines.map((l) => `║ ${l.padEnd(width)} ║`).join('\n');
  return `\n${top}\n${body}\n${bot}`;
}
