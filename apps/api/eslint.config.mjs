import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Controllers run behind the global APP_GUARD chain (AuthGuard ->
    // AbilityGuard). After AuthGuard verifies the Bearer token it attaches
    // `req.user`, so the controller body can trust it exists. The non-null
    // assertion is the standard NestJS pattern here.
    files: ['**/*.controller.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/webpack.config.{js,ts}',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
