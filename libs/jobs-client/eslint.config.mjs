import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
          // Declared so Yarn PnP can satisfy @nestjs/* peers (see docs/audits/dependency-resolution-fix.spec.md); never imported here.
          ignoredDependencies: ['reflect-metadata', 'rxjs'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
