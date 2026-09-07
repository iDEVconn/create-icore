import * as bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { hashPassword, isBcryptHash, verifyPassword } from '../password-hashing';

describe('isBcryptHash', () => {
  it.each(['$2a$10$abcdefghijklmnopqrstuv', '$2b$10$abcdefghijklmnopqrstuv', '$2y$10$abc'])(
    'recognizes bcrypt prefix %s',
    (hash) => {
      expect(isBcryptHash(hash)).toBe(true);
    },
  );

  it('does not treat an argon2id hash as bcrypt', () => {
    expect(isBcryptHash('$argon2id$v=19$m=65536,t=3,p=4$abc$def')).toBe(false);
  });
});

describe('hashPassword / verifyPassword', () => {
  it('hashes with argon2id and round-trips', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('still verifies a legacy bcrypt hash', async () => {
    const legacyHash = await bcrypt.hash('legacy password', 10);
    expect(isBcryptHash(legacyHash)).toBe(true);
    await expect(verifyPassword(legacyHash, 'legacy password')).resolves.toBe(true);
    await expect(verifyPassword(legacyHash, 'wrong password')).resolves.toBe(false);
  });
});
