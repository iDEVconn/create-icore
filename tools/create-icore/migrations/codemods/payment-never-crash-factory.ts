import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const APP_MODULE_PATH = 'apps/microservices/payment/src/app/app.module.ts';
const FAKE_STRATEGY_PATH = 'apps/microservices/payment/src/app/fake-payment.strategy.ts';

const OLD_REGISTRY_IMPORT =
  "import { PaymentRegistry, PaypalStrategy, createPayment } from '@idevconn/payment';";

const NEW_REGISTRY_IMPORT = [
  'import {',
  '  PaymentRegistry,',
  '  PaypalStrategy,',
  '  createPayment,',
  '  type PaymentStrategy,',
  "} from '@idevconn/payment';",
].join('\n');

const OLD_CONTROLLER_IMPORT = "import { PaymentController } from './payment.controller';";

const NEW_CONTROLLER_IMPORT = [
  "import { PaymentController } from './payment.controller';",
  "import { FakePaymentStrategy } from './fake-payment.strategy';",
].join('\n');

const OLD_FACTORY_TAIL = [
  '        const missing = missingEnv((k) => cfg.get<string>(k), keys);',
  '        if (missing.length > 0) {',
  '          const banner = formatEnvBanner({',
  "            service: 'payment MS',",
  '            provider,',
  '            missing,',
  '            envPath: ENV_PATH,',
  '            headline: `⚠  payment MS — ${provider} credentials missing (payments will fail)`,',
  '          });',
  '          // Prod: fail fast. Dev: warn + register an EMPTY strategy map so the',
  "          // MS boots (PaypalStrategy's constructor throws on blank creds, so we",
  '          // must not instantiate it) — payment endpoints fail until creds are set.',
  "          if (process.env.NODE_ENV === 'production') throw new Error(banner);",
  '          logger.warn(banner);',
  '          return createPayment({ strategies: {} });',
  '        }',
  '',
  '        return createPayment({',
  '          strategies: {',
  '            paypal: new PaypalStrategy({',
  "              clientId: cfg.getOrThrow<string>('PAYPAL_CLIENT_ID'),",
  "              secret: cfg.getOrThrow<string>('PAYPAL_CLIENT_SECRET'),",
  "              environment: cfg.get<'sandbox' | 'live'>('PAYPAL_ENVIRONMENT') ?? 'sandbox',",
  '            }),',
  '          },',
  '        });',
].join('\n');

const NEW_FACTORY_TAIL = [
  '        const missing = missingEnv((k) => cfg.get<string>(k), keys);',
  '',
  '        const buildStrategy = (): PaymentStrategy => {',
  '          if (missing.length > 0) {',
  '            const banner = formatEnvBanner({',
  "              service: 'payment MS',",
  '              provider,',
  '              missing,',
  '              envPath: ENV_PATH,',
  '              headline: `⚠  payment MS — ${provider} credentials missing (payments will fail)`,',
  '            });',
  '            logger.warn(banner);',
  '            return new FakePaymentStrategy(provider);',
  '          }',
  '',
  '          return new PaypalStrategy({',
  "            clientId: cfg.getOrThrow<string>('PAYPAL_CLIENT_ID'),",
  "            secret: cfg.getOrThrow<string>('PAYPAL_CLIENT_SECRET'),",
  "            environment: cfg.get<'sandbox' | 'live'>('PAYPAL_ENVIRONMENT') ?? 'sandbox',",
  '          });',
  '        };',
  '',
  '        return createPayment({ strategies: { [provider]: buildStrategy() } });',
].join('\n');

const FAKE_STRATEGY_CONTENT =
  [
    'import {',
    '  PaymentError,',
    '  type CaptureResult,',
    '  type CreateOrderInput,',
    '  type OrderResult,',
    '  type PaymentStrategy,',
    '  type RequestOptions,',
    "} from '@idevconn/payment';",
    '',
    'export class FakePaymentStrategy implements PaymentStrategy {',
    '  constructor(readonly name: string) {}',
    '',
    '  createOrder(_input: CreateOrderInput, _options?: RequestOptions): Promise<OrderResult> {',
    '    return Promise.reject(this.notConfigured());',
    '  }',
    '',
    '  captureOrder(_orderId: string, _options?: RequestOptions): Promise<CaptureResult> {',
    '    return Promise.reject(this.notConfigured());',
    '  }',
    '',
    '  private notConfigured(): PaymentError {',
    '    return new PaymentError(',
    "      'PROVIDER_ERROR',",
    '      503,',
    '      `Payment provider "${this.name}" is not configured (missing credentials)`,',
    '    );',
    '  }',
    '}',
  ].join('\n') + '\n';

/**
 * Patches a pre-fix `payment` app.module.ts (prod fail-fast on missing
 * PayPal creds) into the never-crash factory shape, and ships the
 * FakePaymentStrategy fallback file. Targeted string replacement, not a
 * full overwrite: verifies the known pre-fix anchors are present verbatim
 * before touching anything, and throws with a specific message instead of
 * guessing if the file has drifted too far (customized past recognition,
 * or already migrated) to patch safely.
 */
export default async function migrate(projectDir: string): Promise<void> {
  const appModulePath = join(projectDir, APP_MODULE_PATH);

  let content: string;
  try {
    content = await readFile(appModulePath, 'utf8');
  } catch {
    // affectedAxes already restricts this migration to payment:paypal
    // projects, but stay defensive if it's ever invoked out of band.
    return;
  }

  const anchors = [OLD_REGISTRY_IMPORT, OLD_CONTROLLER_IMPORT, OLD_FACTORY_TAIL];
  const missingAnchor = anchors.find((anchor) => !content.includes(anchor));
  if (missingAnchor !== undefined) {
    throw new Error(
      `payment-never-crash-factory: ${APP_MODULE_PATH} doesn't match the expected pre-fix shape ` +
        `(already migrated, or customized past what this codemod can safely patch). ` +
        `Apply the fix from https://github.com/iDEVconn/create-icore/commit/c13711e manually, ` +
        `then commit with message "migrate: payment-never-crash-factory" and re-run.`,
    );
  }

  const patched = content
    .replace(OLD_REGISTRY_IMPORT, NEW_REGISTRY_IMPORT)
    .replace(OLD_CONTROLLER_IMPORT, NEW_CONTROLLER_IMPORT)
    .replace(OLD_FACTORY_TAIL, NEW_FACTORY_TAIL);

  await writeFile(appModulePath, patched);

  const fakeStrategyPath = join(projectDir, FAKE_STRATEGY_PATH);
  try {
    await access(fakeStrategyPath);
  } catch {
    await writeFile(fakeStrategyPath, FAKE_STRATEGY_CONTENT);
  }
}
