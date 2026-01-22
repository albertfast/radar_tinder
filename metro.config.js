const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  const { transformer, resolver } = config;

  config.transformer = {
    ...transformer,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  };

  // pnpm uses symlinks under node_modules/.pnpm; Metro needs explicit support.
  // This fixes resolution failures like:
  // "Unable to resolve @react-native-firebase/app/lib/common ..."
  config.watchFolders = Array.from(
    new Set([...(config.watchFolders || []), path.join(__dirname, 'node_modules', '.pnpm')])
  );

  config.resolver = {
    ...resolver,
    assetExts: [...resolver.assetExts.filter((ext) => ext !== 'svg'), 'onnx', 'data', 'bin'],
    sourceExts: [...resolver.sourceExts, 'svg'],
    unstable_enableSymlinks: true,
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
