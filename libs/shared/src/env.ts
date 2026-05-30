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
