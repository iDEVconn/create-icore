import baseConfig from '../../eslint.config.mjs';

// `build/` is the tsc output the Worker is bundled from, `.wrangler/` is wrangler's scratch space.
export default [{ ignores: ['build/**', '.wrangler/**'] }, ...baseConfig];
