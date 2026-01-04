const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  const { transformer, resolver } = config;

  config.transformer = {
    ...transformer,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  };
  config.resolver = {
    ...resolver,
    assetExts: [...resolver.assetExts.filter((ext) => ext !== 'svg'), 'onnx', 'data'],
    sourceExts: [...resolver.sourceExts, 'svg'],
    blockList: [
      // Exclude the huge modelx python environment and .git folder
      /\/modelx\/.*/,
      /\.git\/.*/,
      /\/android\/.*/,
      /\/ios\/.*/
    ],
  };

  return config;
})();
