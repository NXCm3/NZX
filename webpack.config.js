const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode !== 'production';

  return {
    mode: isDev ? 'development' : 'production',
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      // contenthash 确保文件内容变化时浏览器自动加载新版本
      // 开发环境使用简单名称便于调试
      filename: isDev ? 'bundle.js' : 'assets/[name].[contenthash:8].js',
      chunkFilename: isDev ? '[name].chunk.js' : 'assets/[name].[contenthash:8].chunk.js',
      // asset 文件名也使用 hash
      assetModuleFilename: isDev ? 'assets/[name][ext]' : 'assets/[name].[contenthash:8][ext]',
      clean: true, // 每次构建清理旧文件
      publicPath: 'auto'
    },
    module: {
      rules: [
        {
          test: /\.mjs$/,
          include: /node_modules/,
          type: 'javascript/auto',
          resolve: {
            fullySpecified: false,
          },
        },
        {
          test: /\.(ts|tsx|js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-react',
                  {
                    runtime: 'automatic',
                    development: isDev
                  }
                ],
                '@babel/preset-env',
                '@babel/preset-typescript'
              ]
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader']
        },
        {
          test: /\.(png|jpe?g|gif|webp|ico|svg)$/i,
          type: 'asset',
          parser: { dataUrlCondition: { maxSize: 1024 * 1024 } }
        },
        {
          test: /\.(woff2?|eot|ttf|otf)$/i,
          type: 'asset/resource'
        },
        {
          exclude: /\.(js|jsx|ts|tsx|mjs|css|json|html)$/i,
          type: 'asset/resource'
        }
      ]
    },
    resolve: {
      extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx']
    },
    devServer: {
      port: 3015,
      host: '0.0.0.0',
      allowedHosts: 'all',
      historyApiFallback: {
        index: '/index.html',
        rewrites: [
          { from: /^\/_p\/\d+\//, to: '/index.html' }
        ]
      }
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html',
        inject: 'body',
        // 生产环境：给 script 标签加上时间戳 query，确保不缓存
        ...(isDev ? {} : {
          hash: true,
          hashPrefix: Date.now().toString(),
        })
      })
    ],
    // 生产环境启用 source-map 但分离到独立文件
    devtool: isDev ? 'eval-cheap-module-source-map' : 'source-map',
    // 优化代码拆分
    optimization: isDev ? {} : {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            chunks: 'all',
            priority: 20
          },
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|framer-motion)[\\/]/,
            name: 'react-vendor',
            chunks: 'all',
            priority: 30
          }
        }
      },
      runtimeChunk: 'single'
    }
  };
};
