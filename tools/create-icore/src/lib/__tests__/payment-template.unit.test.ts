import { describe, expect, it } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const paymentAppDir = join(pkgRoot, 'templates/apps/microservices/payment/src/app');

describe('payment MS template (never-crash factory)', () => {
  it('does NOT fail-fast in production when PayPal keys are missing', async () => {
    const appModule = await readFile(join(paymentAppDir, 'app.module.ts'), 'utf8');
    // The old behaviour threw on boot in prod — that crash-loops the container on the VPS.
    expect(appModule).not.toContain("process.env.NODE_ENV === 'production'");
    expect(appModule).not.toContain('throw new Error(banner)');
    expect(appModule).toContain('FakePaymentStrategy');
    expect(appModule).toContain(
      'return createPayment({ strategies: { [provider]: buildStrategy() } })',
    );
  });

  it('ships the FakePaymentStrategy fallback file', async () => {
    await expect(access(join(paymentAppDir, 'fake-payment.strategy.ts'))).resolves.toBeUndefined();
    const fake = await readFile(join(paymentAppDir, 'fake-payment.strategy.ts'), 'utf8');
    expect(fake).toContain('class FakePaymentStrategy');
    expect(fake).toContain('is not configured (missing credentials)');
  });
});
