import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

// bcrypt hashes always start with one of these version prefixes; argon2id
// hashes always start with $argon2id$. Existing deployments have bcrypt rows
// in _icore_users — new hashes are argon2id (OWASP's current recommendation),
// old ones keep verifying and get lazily upgraded on next successful login.
const BCRYPT_PREFIX = /^\$2[aby]\$/;

export function isBcryptHash(hash: string): boolean {
  return BCRYPT_PREFIX.test(hash);
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (isBcryptHash(hash)) return bcrypt.compare(password, hash);
  return argon2.verify(hash, password);
}
