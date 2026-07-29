const path = require('path');
const package = require('./package.json');
const webpack = require('webpack');

const isProduction =
  process.env.NODE_ENV === 'production' ||
  (process.argv.includes('--mode') &&
    process.argv[process.argv.indexOf('--mode') + 1] === 'production') ||
  process.argv.includes('production');

const tsRule = {
  test: /\.tsx?$/,
  use: {
    loader: 'ts-loader',
    options: {
      compilerOptions: {
        sourceMap: !isProduction,
        inlineSourceMap: false,
        removeComments: isProduction,
      },
    },
  },
  exclude: /node_modules/,
};

// Second compilation: the self-contained search worker bundle (optimizer +
// inline WASM, no externals). Emitted to src/worker/generated and imported
// by the main bundle as raw text (asset/source), then instantiated from a
// Blob URL at runtime — the production publicPath is mod:// and the mod runs
// as an inline script on a file:// page, so URL-loaded chunks cannot resolve.
const workerConfig = {
  name: 'worker',
  mode: 'development',
  devtool: false,
  target: 'webworker',
  entry: './src/worker/searchWorker.ts',
  optimization: {
    minimize: isProduction,
  },
  module: {
    rules: [tsRule],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'searchWorker.js',
    path: path.resolve(__dirname, 'src/worker/generated'),
  },
  plugins: [
    new webpack.DefinePlugin({
      MOD_METADATA: JSON.stringify({
        name: package.name,
        version: package.version,
        author: package.author,
        description: package.description,
      }),
    }),
  ],
};

module.exports = {
  mode: 'development',
  devtool: isProduction ? false : 'source-map',
  entry: './src/mod.ts',
  dependencies: ['worker'],
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
    'react-dom/client': 'ReactDOM',
    '@mui/material': 'MaterialUI',
    '@mui/icons-material': 'MaterialUIIcons',
  },
  optimization: {
    minimize: isProduction,
  },
  module: {
    rules: [
      tsRule,
      {
        // The worker bundle crosses into the main bundle as raw text and is
        // instantiated via `new Worker(URL.createObjectURL(new Blob([...])))`.
        test: /generated[\\/]searchWorker\.js$/,
        type: 'asset/source',
      },
      {
        test: /\.(png|jpg|gif|svg|webp)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]',
        },
      },
      {
        test: /\.(otf|ttf|woff|woff2|eot)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'mod.js',
    path: path.resolve(__dirname, `dist/${package.name}`),
    library: {
      name: 'AFNMMod',
      type: 'umd',
      export: 'default',
    },
    globalObject: 'this',
    publicPath: 'mod://',
  },
  plugins: [
    new webpack.DefinePlugin({
      MOD_METADATA: JSON.stringify({
        name: package.name,
        version: package.version,
        author: package.author,
        description: package.description,
      }),
    }),
  ],
};

const mainConfig = module.exports;
module.exports = [workerConfig, mainConfig];
