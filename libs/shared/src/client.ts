// Browser-safe subset of @icore/shared.
// Import from '@icore/shared/client' in client-side code to avoid pulling
// in NestJS / Node.js-only modules (transport, strategies, contracts).
export * from './abilities';
export * from './types';
