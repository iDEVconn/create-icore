import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Exclude generated/baked directories from all linting.
    // Patterns here are relative to the workspace root (where ESLint is invoked).
    ignores: [
      'tools/create-icore/templates/**',
      'tools/create-icore/dist/**',
      'tools/create-icore/scripts/**',
      'tools/create-icore/_template-shell/**',
    ],
  },
  {
    files: ['tools/create-icore/**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
          ],
          ignoredDependencies: ['tsup', 'vitest'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
