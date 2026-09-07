import { createHash } from 'node:crypto';

/**
 * Refresh tokens are stored as this hash, never plaintext — a stolen DB
 * dump alone must not be replayable against the auth endpoint.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type RefreshDecision =
  { kind: 'not_found' } | { kind: 'reuse_detected' } | { kind: 'expired' } | { kind: 'rotate' };

export interface RefreshSessionRow {
  revokedAt: Date | null;
  expiresAt: Date;
}

/**
 * A revoked (already-rotated) row being presented again means the token was
 * captured and replayed by someone else after the legitimate client rotated
 * it — that takes priority over an expiry check, since the whole family must
 * be revoked regardless of whether the stale row would also count as expired.
 */
export function decideRefresh(session: RefreshSessionRow | undefined, now: Date): RefreshDecision {
  if (!session) return { kind: 'not_found' };
  if (session.revokedAt) return { kind: 'reuse_detected' };
  if (session.expiresAt < now) return { kind: 'expired' };
  return { kind: 'rotate' };
}
