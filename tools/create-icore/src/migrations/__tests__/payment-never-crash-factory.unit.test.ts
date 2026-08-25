import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import migrate from '../../../migrations/codemods/payment-never-crash-factory.js';

const APP_DIR = 'apps/microservices/payment/src/app';

const OLD_APP_MODULE = [
  "import { join } from 'node:path';",
  "import { Module, Logger } from '@nestjs/common';",
  "import { ConfigModule, ConfigService } from '@nestjs/config';",
  "import { PaymentRegistry, PaypalStrategy, createPayment } from '@idevconn/payment';",
  "import { missingEnv, formatEnvBanner } from '@icore/shared';",
  "import { PaymentController } from './payment.controller';",
  '',
  "const ENV_PATH = 'apps/microservices/payment/.env';",
  '',
  'const REQUIRED_ENV: Record<string, string[]> = {',
  "  paypal: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],",
  '};',
  '',
  '@Module({',
  '  imports: [',
  '    ConfigModule.forRoot({',
  '      isGlobal: true,',
  '      envFilePath: [',
  "        join(process.cwd(), 'apps/microservices/payment/.env'),",
  "        join(process.cwd(), '.env'),",
  '      ],',
  '    }),',
  '  ],',
  '  controllers: [PaymentController],',
  '  providers: [',
  '    {',
  '      provide: PaymentRegistry,',
  '      useFactory: (cfg: ConfigService) => {',
  "        const logger = new Logger('PaymentRegistry');",
  "        const provider = (cfg.get<string>('PAYMENT_PROVIDER') ?? 'paypal').trim();",
  '        const keys = REQUIRED_ENV[provider];',
  '        if (!keys) throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);',
  '',
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
  '      },',
  '      inject: [ConfigService],',
  '    },',
  '  ],',
  '})',
  'export class AppModule {}',
  '',
].join('\n');

const NEW_APP_MODULE = [
  "import { join } from 'node:path';",
  "import { Module, Logger } from '@nestjs/common';",
  "import { ConfigModule, ConfigService } from '@nestjs/config';",
  'import {',
  '  PaymentRegistry,',
  '  PaypalStrategy,',
  '  createPayment,',
  '  type PaymentStrategy,',
  "} from '@idevconn/payment';",
  "import { missingEnv, formatEnvBanner } from '@icore/shared';",
  "import { PaymentController } from './payment.controller';",
  "import { FakePaymentStrategy } from './fake-payment.strategy';",
  '',
  "const ENV_PATH = 'apps/microservices/payment/.env';",
  '',
  'const REQUIRED_ENV: Record<string, string[]> = {',
  "  paypal: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],",
  '};',
  '',
  '@Module({',
  '  imports: [',
  '    ConfigModule.forRoot({',
  '      isGlobal: true,',
  '      envFilePath: [',
  "        join(process.cwd(), 'apps/microservices/payment/.env'),",
  "        join(process.cwd(), '.env'),",
  '      ],',
  '    }),',
  '  ],',
  '  controllers: [PaymentController],',
  '  providers: [',
  '    {',
  '      provide: PaymentRegistry,',
  '      useFactory: (cfg: ConfigService) => {',
  "        const logger = new Logger('PaymentRegistry');",
  "        const provider = (cfg.get<string>('PAYMENT_PROVIDER') ?? 'paypal').trim();",
  '        const keys = REQUIRED_ENV[provider];',
  '        if (!keys) throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);',
  '',
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
  '      },',
  '      inject: [ConfigService],',
  '    },',
  '  ],',
  '})',
  'export class AppModule {}',
  '',
].join('\n');

async function makeFixture(appModuleContent: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-payment-migrate-'));
  await mkdir(join(dir, APP_DIR), { recursive: true });
  await writeFile(join(dir, APP_DIR, 'app.module.ts'), appModuleContent);
  return dir;
}

describe('payment-never-crash-factory codemod', () => {
  it('patches a pre-fix app.module.ts into the never-crash factory shape byte-for-byte', async () => {
    const dir = await makeFixture(OLD_APP_MODULE);

    await migrate(dir);

    const patched = await readFile(join(dir, APP_DIR, 'app.module.ts'), 'utf8');
    expect(patched).toBe(NEW_APP_MODULE);
  });

  it('ships the FakePaymentStrategy fallback file', async () => {
    const dir = await makeFixture(OLD_APP_MODULE);

    await migrate(dir);

    const fake = await readFile(join(dir, APP_DIR, 'fake-payment.strategy.ts'), 'utf8');
    expect(fake).toContain('class FakePaymentStrategy');
    expect(fake).toContain('is not configured (missing credentials)');
  });

  it('does not overwrite an existing fake-payment.strategy.ts', async () => {
    const dir = await makeFixture(OLD_APP_MODULE);
    const fakePath = join(dir, APP_DIR, 'fake-payment.strategy.ts');
    await writeFile(fakePath, '// custom fallback, kept as-is\n');

    await migrate(dir);

    expect(await readFile(fakePath, 'utf8')).toBe('// custom fallback, kept as-is\n');
  });

  it('throws instead of guessing when the file is already migrated', async () => {
    const dir = await makeFixture(NEW_APP_MODULE);

    await expect(migrate(dir)).rejects.toThrow(/payment-never-crash-factory/);
  });

  it('throws instead of guessing when the file has been customized past recognition', async () => {
    const dir = await makeFixture('export class AppModule {}\n');

    await expect(migrate(dir)).rejects.toThrow(/payment-never-crash-factory/);
  });

  it('is a silent no-op when the project has no payment app (payment=none)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-payment-migrate-'));

    await expect(migrate(dir)).resolves.toBeUndefined();
  });
});
