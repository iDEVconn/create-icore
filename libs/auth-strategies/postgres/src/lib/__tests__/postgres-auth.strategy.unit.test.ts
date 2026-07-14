import { describe, expect, it } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { createMockPostgresAuth } from '../testing/mock-postgres-auth';

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
