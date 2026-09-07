import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcrypt';
import { hashPassword } from '../password-hashing';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string | null;
}

let userRow: UserRow | null = null;
const updateCalls: string[] = [];

// PostgresAuthStrategy talks to `postgres` exclusively through tagged
// templates (`this.sql\`...\``) — stubbing the package's default export lets
// signIn's rehash branch run against a real PostgresAuthStrategy instance
// without a live database, the same way the RPC-propagation test in
// postgres-auth.strategy.unit.test.ts already does for the error paths.
vi.mock('postgres', () => ({
  default:
    () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join(' ');
      if (text.includes('CREATE TABLE')) return Promise.resolve([]);
      if (text.includes('SELECT id, email, password_hash, role FROM _icore_users')) {
        return Promise.resolve(userRow ? [userRow] : []);
      }
      if (text.includes('UPDATE _icore_users SET password_hash')) {
        const newHash = String(values[0]);
        updateCalls.push(newHash);
        if (userRow) userRow = { ...userRow, password_hash: newHash };
        return Promise.resolve([]);
      }
      if (text.includes('UPDATE _icore_users SET last_logged_in')) return Promise.resolve([]);
      return Promise.resolve([]);
    },
}));

describe('PostgresAuthStrategy — lazy password rehash', () => {
  beforeEach(() => {
    updateCalls.length = 0;
    userRow = null;
  });

  it('rehashes a legacy bcrypt hash to argon2id after a successful login', async () => {
    const { PostgresAuthStrategy } = await import('../postgres-auth.strategy');
    const legacyHash = await bcrypt.hash('correct-password', 10);
    userRow = { id: 'u1', email: 'x@x.com', password_hash: legacyHash, role: null };
    const strategy = new PostgresAuthStrategy({ url: 'postgres://test/db', jwtSecret: 's' });

    await strategy.signIn('x@x.com', 'correct-password');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.startsWith('$argon2id$')).toBe(true);
    expect(userRow?.password_hash.startsWith('$argon2id$')).toBe(true);
  });

  it('does not rewrite a hash that is already argon2id', async () => {
    const { PostgresAuthStrategy } = await import('../postgres-auth.strategy');
    const argon2Hash = await hashPassword('correct-password');
    userRow = { id: 'u1', email: 'x@x.com', password_hash: argon2Hash, role: null };
    const strategy = new PostgresAuthStrategy({ url: 'postgres://test/db', jwtSecret: 's' });

    await strategy.signIn('x@x.com', 'correct-password');

    expect(updateCalls).toHaveLength(0);
  });

  it('does not rehash on a failed login', async () => {
    const { PostgresAuthStrategy } = await import('../postgres-auth.strategy');
    const legacyHash = await bcrypt.hash('correct-password', 10);
    userRow = { id: 'u1', email: 'x@x.com', password_hash: legacyHash, role: null };
    const strategy = new PostgresAuthStrategy({ url: 'postgres://test/db', jwtSecret: 's' });

    await expect(strategy.signIn('x@x.com', 'wrong-password')).rejects.toThrow(
      'invalid_credentials',
    );

    expect(updateCalls).toHaveLength(0);
  });
});
