const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { TsconfigPathsPlugin } = require('tsconfig-paths-webpack-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../../dist/apps/microservices/payment'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  resolve: {
    // Resolve @icore/* via tsconfig paths so webpack can bundle them inline.
    // nx skips its own tsconfig-paths plugin on "TS solution" workspaces, so we
    // wire the standalone plugin explicitly (it follows extends → tsconfig.base).
    plugins: [new TsconfigPathsPlugin({ configFile: join(__dirname, 'tsconfig.app.json') })],
  },
  // Keep every npm package external EXCEPT @icore/* workspace packages, which
  // are bundled inline. @icore/* are workspace-internal: at runtime the package
  // manager symlinks them to their TS source dir (not the compiled dist), so an
  // external require('@icore/shared') fails ("Cannot find module './env'").
  // Bundling removes runtime workspace resolution entirely — works identically
  // on yarn / npm / pnpm.
  externals: [
    function ({ request }, callback) {
      if (
        !request ||
        request.startsWith('.') ||
        request.startsWith('/') ||
        request.startsWith('@icore/')
      ) {
        return callback(); // bundle inline
      }
      return callback(null, 'commonjs ' + request); // keep external
    },
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      // Keep our externals (above) authoritative — do not let the plugin add
      // its own nodeExternals that would re-externalize @icore/*.
      mergeExternals: true,
      externalDependencies: [],
      sourceMap: true,
    }),
  ],
};
