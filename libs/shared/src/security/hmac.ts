import { createHmac, timingSafeEqual } from 'node:crypto';

/** Deterministic HMAC-SHA256 signature over a JSON-stable payload. */
export function signHmac(payload: unknown, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export function verifyHmac(payload: unknown, signature: string, secret: string): boolean {
  const expected = Buffer.from(signHmac(payload, secret), 'hex');
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
