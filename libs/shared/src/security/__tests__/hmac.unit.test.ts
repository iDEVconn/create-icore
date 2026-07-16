import { describe, expect, it } from 'vitest';
import { signHmac, verifyHmac } from '../hmac';

describe('signHmac / verifyHmac', () => {
  it('verifies a signature produced by signHmac for the same payload + secret', () => {
    const payload = { uid: 'u1', role: 'admin' };
    const sig = signHmac(payload, 'shared-secret');
    expect(verifyHmac(payload, sig, 'shared-secret')).toBe(true);
  });

  it('rejects a signature produced with a different secret', () => {
    const payload = { uid: 'u1', role: 'admin' };
    const sig = signHmac(payload, 'secret-a');
    expect(verifyHmac(payload, sig, 'secret-b')).toBe(false);
  });

  it('rejects a signature when the payload has been tampered with', () => {
    const sig = signHmac({ uid: 'u1', role: 'user' }, 'shared-secret');
    expect(verifyHmac({ uid: 'u1', role: 'admin' }, sig, 'shared-secret')).toBe(false);
  });

  it('rejects a malformed/non-hex signature without throwing', () => {
    expect(verifyHmac({ uid: 'u1' }, 'not-valid-hex-!!', 'shared-secret')).toBe(false);
  });
});
