import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/src/**/*.{spec,test}.{js,ts,jsx,tsx}',
            '{projectRoot}/src/**/__tests__/**/*.{js,ts,jsx,tsx}',
          ],
          // Declared so Yarn PnP can satisfy @nestjs/* peers (see docs/audits/dependency-resolution-fix.spec.md); never imported here.
          ignoredDependencies: ['reflect-metadata'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
