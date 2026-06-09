import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from '../wire-provider.js';
import type { Unit } from '../types.js';

const SECTION: Record<string, Unit> = {
  alpha: {
    libDirs: ['libs/x/alpha'],
    deps: { 'sdk-alpha': '^1.0.0' },
    tsPaths: { '@icore/x-alpha': ['libs/x/alpha/src/index.ts'] },
    nestModule: { importFrom: '@icore/x-alpha', symbol: 'AlphaModule', into: 'auth' },
    appTests: ['apps/microservices/x/src/app/__tests__/x.controller.alpha.unit.test.ts'],
  },
  beta: {
    libDirs: ['libs/x/beta'],
    deps: { 'sdk-beta': '^2.0.0' },
    tsPaths: { '@icore/x-beta': ['libs/x/beta/src/index.ts'] },
    nestModule: { importFrom: '@icore/x-beta', symbol: 'BetaModule', into: 'auth' },
  },
};

const AXIS: AxisWiring = {
  section: SECTION,
  providerFile: 'apps/microservices/x/src/app/x.provider.ts',
  exportConst: 'XProviderModule',
  msPackageJson: 'apps/microservices/x/package.json',
  envPath: 'apps/microservices/x/.env',
};

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wireprov-'));
  await mkdir(join(dir, 'apps/microservices/x/src/app/__tests__'), { recursive: true });
  await writeFile(join(dir, 'apps/microservices/x/src/app/x.provider.ts'), '// placeholder\n');
  await writeFile(
    join(dir, 'apps/microservices/x/src/app/__tests__/x.controller.alpha.unit.test.ts'),
    '// alpha test',
  );
  for (const d of ['alpha', 'beta']) {
    await mkdir(join(dir, `libs/x/${d}/src`), { recursive: true });
    await writeFile(join(dir, `libs/x/${d}/src/index.ts`), 'export {};');
  }
  await writeFile(
    join(dir, 'apps/microservices/x/package.json'),
    JSON.stringify({
      name: 'x',
      dependencies: {
        '@icore/x-alpha': '*',
        '@icore/x-beta': '*',
        'sdk-alpha': '^1.0.0',
        'sdk-beta': '^2.0.0',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/x-alpha': ['libs/x/alpha/src/index.ts'],
          '@icore/x-beta': ['libs/x/beta/src/index.ts'],
        },
      },
    }),
  );
  return dir;
}

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('writeProvider', () => {
  it('writes the provider file wiring the chosen module + export const', async () => {
    const dir = await fixture();
    await writeProvider(dir, AXIS, 'beta');
    const src = await readFile(join(dir, 'apps/microservices/x/src/app/x.provider.ts'), 'utf8');
    expect(src).toContain("import { BetaModule } from '@icore/x-beta';");
    expect(src).toContain('export const XProviderModule = BetaModule.forRoot(ENV_PATH);');
    expect(src).toContain("const ENV_PATH = 'apps/microservices/x/.env';");
  });

  it('throws when the chosen provider has no nestModule', async () => {
    const dir = await fixture();
    const bad: AxisWiring = { ...AXIS, section: { gamma: { libDirs: [], deps: {}, tsPaths: {} } } };
    await expect(writeProvider(dir, bad, 'gamma')).rejects.toThrow();
  });
});

describe('cleanupUnusedAxis', () => {
  it('removes unchosen libs, appTests, workspace+raw deps and tsconfig paths; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedAxis(dir, AXIS, 'alpha'); // keep alpha, drop beta

    expect(await exists(join(dir, 'libs/x/alpha'))).toBe(true);
    expect(await exists(join(dir, 'libs/x/beta'))).toBe(false);
    // alpha's controller test kept (it's the chosen one); beta has none
    expect(
      await exists(
        join(dir, 'apps/microservices/x/src/app/__tests__/x.controller.alpha.unit.test.ts'),
      ),
    ).toBe(true);

    const pkg = JSON.parse(await readFile(join(dir, 'apps/microservices/x/package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual({ '@icore/x-alpha': '*', 'sdk-alpha': '^1.0.0' }); // beta workspace + raw sdk-beta stripped
    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/x-alpha']);
  });

  it('removes the chosen-elsewhere appTests of unchosen providers', async () => {
    const dir = await fixture();
    // add an alpha lib but choose beta -> alpha (with its appTest) must be removed
    await cleanupUnusedAxis(dir, AXIS, 'beta');
    expect(
      await exists(
        join(dir, 'apps/microservices/x/src/app/__tests__/x.controller.alpha.unit.test.ts'),
      ),
    ).toBe(false);
  });
});
