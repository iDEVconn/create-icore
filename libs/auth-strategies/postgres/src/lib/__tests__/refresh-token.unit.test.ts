import { describe, expect, it } from 'vitest';
import { decideRefresh, hashRefreshToken } from '../refresh-token';

describe('hashRefreshToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
  });

  it('differs for different inputs', () => {
    expect(hashRefreshToken('abc')).not.toBe(hashRefreshToken('abd'));
  });

  it('never returns the plaintext input', () => {
    expect(hashRefreshToken('abc')).not.toBe('abc');
  });
});

describe('decideRefresh', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const future = new Date('2026-01-02T00:00:00Z');
  const past = new Date('2025-12-31T00:00:00Z');

  it('returns not_found when no session matches the token hash', () => {
    expect(decideRefresh(undefined, now)).toEqual({ kind: 'not_found' });
  });

  it('returns reuse_detected when the session was already rotated out', () => {
    expect(decideRefresh({ revokedAt: past, expiresAt: future }, now)).toEqual({
      kind: 'reuse_detected',
    });
  });

  it('returns expired when the session has passed its expiry', () => {
    expect(decideRefresh({ revokedAt: null, expiresAt: past }, now)).toEqual({ kind: 'expired' });
  });

  it('returns rotate for a live, unrevoked, unexpired session', () => {
    expect(decideRefresh({ revokedAt: null, expiresAt: future }, now)).toEqual({ kind: 'rotate' });
  });

  it('prioritizes reuse_detected over expired when both are true', () => {
    expect(decideRefresh({ revokedAt: past, expiresAt: past }, now)).toEqual({
      kind: 'reuse_detected',
    });
  });
});
