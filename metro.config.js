const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  const { transformer, resolver } = config;

  config.transformer = {
    ...transformer,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  };

  // pnpm uses a nested node_modules layout. These settings help Metro resolve packages correctly.
  config.watchFolders = Array.from(
    new Set([...(config.watchFolders || []), path.join(__dirname, 'node_modules', '.pnpm')])
  );

  config.resolver = {
    ...resolver,
    assetExts: [...resolver.assetExts.filter((ext) => ext !== 'svg'), 'onnx', 'data', 'bin'],
    sourceExts: [...resolver.sourceExts, 'svg'],
    nodeModulesPaths: [
      path.join(__dirname, 'node_modules'),
      path.join(__dirname, 'node_modules', '.pnpm', 'node_modules'),
    ],
    blockList: [
      ...(Array.isArray(resolver.blockList) ? resolver.blockList : [resolver.blockList]),
      // Exclude the huge modelx python environment and .git folder (project-local only)
      new RegExp('^' + escapeRegExp(path.join(__dirname, 'modelx')) + '.*'),
      new RegExp('^' + escapeRegExp(path.join(__dirname, '.git')) + '.*'),
    ],
  };

  return config;
})();

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
