const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { TsconfigPathsPlugin } = require('tsconfig-paths-webpack-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  resolve: {
    plugins: [new TsconfigPathsPlugin({ configFile: join(__dirname, 'tsconfig.app.json') })],
  },
  // See microservices/*/webpack.config.js for the @icore/* bundling rationale.
  externals: [
    function ({ request }, callback) {
      if (
        !request ||
        request.startsWith('.') ||
        request.startsWith('/') ||
        request.startsWith('@icore/')
      ) {
        return callback();
      }
      return callback(null, 'commonjs ' + request);
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
      mergeExternals: true,
      externalDependencies: [],
      sourceMap: true,
    }),
  ],
};
