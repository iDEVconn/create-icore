import { describe, expect, it } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { createMockPostgresAuth } from '../testing/mock-postgres-auth';
import type { PostgresAuthStrategyOptions } from '../postgres-auth.strategy';

// createMockPostgresAuth is the in-memory double used by the contract suite;
// it mirrors PostgresAuthStrategy's control flow closely enough to exercise
// the same domain-error branches without a real Postgres connection. The
// actual RpcException conversion under test lives in postgres-auth.strategy.ts
// itself — see the module-level contract test for the full round-trip.

describe('PostgresAuthStrategy — RPC error propagation', () => {
  it('signIn with wrong password rejects with invalid_credentials', async () => {
    const strategy = createMockPostgresAuth();
    await strategy.signUp('x@x.com', 'right-pw12345');
    await expect(strategy.signIn('x@x.com', 'wrong-pw12345')).rejects.toThrow(
      'invalid_credentials',
    );
  });

  it('signUp with a duplicate email rejects with user_already_exists', async () => {
    const strategy = createMockPostgresAuth();
    await strategy.signUp('dup@x.com', 'pw12345!');
    await expect(strategy.signUp('dup@x.com', 'pw12345!')).rejects.toThrow('user_already_exists');
  });

  it('refresh with an unknown token rejects with invalid_refresh_token', async () => {
    const strategy = createMockPostgresAuth();
    await expect(strategy.refresh('not-a-real-token')).rejects.toThrow('invalid_refresh_token');
  });

  it('domain errors from the real strategy are RpcException instances (survive the TCP hop with their message intact)', async () => {
    // RpcException is what Nest's BaseRpcExceptionFilter forwards verbatim;
    // a plain Error gets collapsed into a generic RPC error by the filter,
    // losing the distinction between invalid_credentials/user_already_exists/etc.
    const { PostgresAuthStrategy } = await import('../postgres-auth.strategy');
    const strategy = new PostgresAuthStrategy({
      url: 'postgres://invalid-host-never-resolves/db',
      jwtSecret: 'test-secret',
    });
    await expect(strategy.verifyToken('not-a-jwt')).rejects.toBeInstanceOf(RpcException);
  });
});

describe('PostgresAuthStrategy — profile', () => {
  const calls: { text: string; values: unknown[] }[] = [];
  let rows: Record<string, unknown>[] = [];
  const createSql = (() =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('?').replace(/\s+/g, ' ').trim(), values });
      return Promise.resolve(rows);
    }) as unknown as NonNullable<PostgresAuthStrategyOptions['createSql']>;

  async function make() {
    const { PostgresAuthStrategy } = await import('../postgres-auth.strategy');
    calls.length = 0;
    return new PostgresAuthStrategy({ url: 'postgres://test/db', jwtSecret: 's', createSql });
  }

  it('adds the name column to an existing _icore_users table', async () => {
    rows = [];
    const strategy = await make();
    await strategy.getProfile('u1').catch(() => undefined);
    expect(calls.some((c) => c.text.includes('ADD COLUMN IF NOT EXISTS name TEXT'))).toBe(true);
  });

  it('updateProfile binds the name and uid as parameters (no string interpolation)', async () => {
    rows = [{ id: 'u1' }];
    const strategy = await make();
    expect(await strategy.updateProfile('u1', { name: "O'Brien; DROP TABLE x" })).toEqual({
      name: "O'Brien; DROP TABLE x",
    });
    const update = calls.find((c) => c.text.startsWith('UPDATE _icore_users SET name ='));
    expect(update?.values).toEqual(["O'Brien; DROP TABLE x", 'u1']);
    expect(update?.text).not.toContain('DROP');
  });

  it('updateProfile / getProfile reject an unknown user', async () => {
    rows = [];
    const strategy = await make();
    await expect(strategy.updateProfile('nope', { name: 'x' })).rejects.toThrow('user_missing');
    await expect(strategy.getProfile('nope')).rejects.toThrow('user_missing');
  });

  it('getProfile maps an empty or null name to null', async () => {
    const strategy = await make();
    rows = [{ name: null }];
    expect(await strategy.getProfile('u1')).toEqual({ name: null });
    rows = [{ name: '' }];
    expect(await strategy.getProfile('u1')).toEqual({ name: null });
    rows = [{ name: 'Ada' }];
    expect(await strategy.getProfile('u1')).toEqual({ name: 'Ada' });
  });
});
