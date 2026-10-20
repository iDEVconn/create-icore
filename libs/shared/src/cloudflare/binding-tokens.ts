/**
 * Nest injection tokens the Worker host provides from its bindings (`env.SESSIONS`,
 * `env.THROTTLE`). They live here so the gateway can consume them without importing
 * the Worker app.
 */
export const SESSION_DO_NAMESPACE = 'SESSION_DO_NAMESPACE';
export const THROTTLER_DO_NAMESPACE = 'THROTTLER_DO_NAMESPACE';
