import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
}

async function patchManifest(
  path: string,
  patch: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    private?: boolean;
  },
): Promise<boolean> {
  if (!existsSync(path)) return false;
  let parsed: Manifest;
  try {
    const raw = await readFile(path, 'utf8');
    parsed = JSON.parse(raw) as Manifest;
  } catch {
    return false;
  }

  let modified = false;

  if (patch.dependencies) {
    parsed.dependencies ??= {};
    for (const [k, v] of Object.entries(patch.dependencies)) {
      if (!parsed.dependencies[k]) {
        parsed.dependencies[k] = v;
        modified = true;
      }
    }
  }

  if (patch.devDependencies) {
    parsed.devDependencies ??= {};
    for (const [k, v] of Object.entries(patch.devDependencies)) {
      if (!parsed.devDependencies[k]) {
        parsed.devDependencies[k] = v;
        modified = true;
      }
    }
  }

  if (patch.peerDependencies) {
    parsed.peerDependencies ??= {};
    for (const [k, v] of Object.entries(patch.peerDependencies)) {
      if (!parsed.peerDependencies[k]) {
        parsed.peerDependencies[k] = v;
        modified = true;
      }
    }
  }

  if (patch.private === true && parsed.private !== true) {
    parsed.private = true;
    modified = true;
  }

  if (modified) {
    await writeFile(path, JSON.stringify(parsed, null, 2) + '\n');
  }
  return modified;
}

const WEBPACK_APP_DEV = {
  '@nx/vite': '23.2.1',
  '@nx/webpack': '23.2.1',
  'tsconfig-paths-webpack-plugin': '^4.2.0',
  vite: '^8.3.2',
  vitest: '~5.0.3',
  webpack: '5.111.1',
} as const;

const VITEST_LIB_DEV = {
  '@nx/vite': '23.2.1',
  'jsonc-eslint-parser': '^3.3.0',
  vite: '^8.3.2',
  vitest: '~5.0.3',
} as const;

const JEST_CLIENT_LIB_DEV = {
  'jsonc-eslint-parser': '^3.3.0',
  jest: '~30.5.2',
  'ts-jest': '^29.4.14',
} as const;

/**
 * Migration codemod: restores workspace-local dependency declarations required
 * under Yarn Berry strict resolution (PnP) and fixes missing root webpack.
 */
export default async function migrate(projectDir: string): Promise<void> {
  const yarnrcPath = join(projectDir, '.yarnrc.yml');
  if (!existsSync(yarnrcPath)) {
    await writeFile(
      yarnrcPath,
      [
        'approvedGitRepositories:',
        '  - "**"',
        '',
        'enableGlobalCache: true',
        'enableScripts: true',
        'nodeLinker: node-modules',
        'npmMinimalAgeGate: 0',
        'yarnPath: .yarn/releases/yarn-4.18.0.cjs',
        '',
      ].join('\n'),
    );
  }

  await patchManifest(join(projectDir, 'package.json'), {
    devDependencies: {
      webpack: '5.111.1',
    },
  });

  await patchManifest(join(projectDir, 'apps/api/package.json'), {
    devDependencies: {
      ...WEBPACK_APP_DEV,
      'jsonc-eslint-parser': '^3.3.0',
    },
    dependencies: {
      '@bull-board/ui': '^9.10.2',
      bullmq: '^6.3.11',
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.2',
    },
  });

  const clientDirs = [
    'apps/client',
    'apps/templates/client-shadcn',
    'apps/templates/client-antd',
    'apps/templates/client-mui',
  ];
  for (const cDir of clientDirs) {
    await patchManifest(join(projectDir, cDir, 'package.json'), {
      devDependencies: {
        '@icore/vite-plugins': '*',
        '@nx/vite': '23.2.1',
        '@tanstack/router-plugin': '^1.168.42',
        '@testing-library/react': '16.3.3',
        '@types/react': '^19.3.0',
        '@types/react-dom': '^19.3.0',
        '@vitejs/plugin-react': '^6.1.1',
        vite: '^8.3.2',
        vitest: '~5.0.3',
      },
      dependencies: {
        '@icore/shared': '*',
        '@icore/template-shared': '*',
        '@idevconn/api-client': '^0.3.3',
        '@idevconn/use-draft': '^0.2.3',
        '@tanstack/react-query': '^5.104.1',
        '@tanstack/react-router': '^1.170.41',
        i18next: '^26.4.2',
        react: '^19.3.0',
        'react-dom': '^19.3.0',
        'react-i18next': '^17.0.15',
        zustand: '^5.0.15',
      },
    });
  }

  const msBaseDir = join(projectDir, 'apps/microservices');
  if (existsSync(msBaseDir)) {
    for (const sub of readdirSync(msBaseDir)) {
      if (sub.endsWith('-e2e')) continue;
      await patchManifest(join(msBaseDir, sub, 'package.json'), {
        private: true,
        devDependencies: { ...WEBPACK_APP_DEV },
      });
    }
  }

  await patchManifest(join(projectDir, 'libs/shared/package.json'), {
    devDependencies: { ...VITEST_LIB_DEV },
  });

  await patchManifest(join(projectDir, 'libs/template-shared/package.json'), {
    devDependencies: {
      ...VITEST_LIB_DEV,
      '@tanstack/react-router': '^1.170.41',
      react: '^19.3.0',
      'react-dom': '^19.3.0',
    },
    peerDependencies: {
      '@tanstack/react-router': '^1.170.41',
      react: '^19.3.0',
      'react-dom': '^19.3.0',
    },
  });

  await patchManifest(join(projectDir, 'libs/jobs-client/package.json'), {
    devDependencies: { ...JEST_CLIENT_LIB_DEV },
    dependencies: {
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.2',
    },
  });

  const vitestClientLibs = ['auth-client', 'upload-client', 'firebase-admin'];
  for (const cl of vitestClientLibs) {
    await patchManifest(join(projectDir, 'libs', cl, 'package.json'), {
      devDependencies: { ...VITEST_LIB_DEV },
      dependencies: {
        'reflect-metadata': '^0.2.2',
        rxjs: '^7.8.2',
      },
    });
  }

  const jestClientLibs = ['ai-client', 'notes-client', 'payment-client'];
  for (const cl of jestClientLibs) {
    await patchManifest(join(projectDir, 'libs', cl, 'package.json'), {
      devDependencies: { ...JEST_CLIENT_LIB_DEV },
      dependencies: {
        'reflect-metadata': '^0.2.2',
        rxjs: '^7.8.2',
      },
    });
  }

  const strategyDirs = ['auth-strategies', 'db-strategies', 'storage-strategies'];
  for (const sDir of strategyDirs) {
    const full = join(projectDir, 'libs', sDir);
    if (!existsSync(full)) continue;
    for (const sub of readdirSync(full)) {
      await patchManifest(join(full, sub, 'package.json'), {
        devDependencies: { ...VITEST_LIB_DEV },
      });
    }
  }

  await patchManifest(join(projectDir, 'libs/vite-plugins/package.json'), {
    devDependencies: {
      'jsonc-eslint-parser': '^3.3.0',
      vite: '^8.3.2',
    },
  });
}
