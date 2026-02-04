const path = require('path');
const package = require('./package.json');
const webpack = require('webpack');

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  entry: './src/mod.ts',
  externals: {
    'react': 'React',
    'react-dom': 'ReactDOM',
    '@mui/material': 'MaterialUI',
    "@mui/icons-material": "MaterialUIIcons",
  },
  optimization: {
    minimize: false,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            compilerOptions: {
              sourceMap: true,
              inlineSourceMap: false,
              removeComments: false,
            },
          },
        },
        exclude: /node_modules/,
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
