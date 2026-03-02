const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const os = require('os');
const fs = require('fs');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  const { transformer, resolver } = config;

  config.transformer = {
    ...transformer,
    // Expo projects should use the Expo-aware transformer entry.
    babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
  };

  // pnpm uses a nested node_modules layout. These settings help Metro resolve packages correctly.
  // Also include pnpm dlx cache roots so Metro can hash Expo CLI metro-require files when started via `pnpm dlx expo`.
  const watchFolders = new Set(config.watchFolders || []);
  const localPnpmStore = path.join(__dirname, 'node_modules', '.pnpm');
  if (fs.existsSync(localPnpmStore)) {
    watchFolders.add(localPnpmStore);
  }
  const enableWideMetroWatch = /^(1|true|yes)$/i.test(process.env.EXPO_USE_WIDE_METRO_WATCH || '');
  if (enableWideMetroWatch) {
    const pnpmDlxRoot = path.join(os.homedir(), '.cache', 'pnpm', 'dlx');
    if (fs.existsSync(pnpmDlxRoot)) {
      watchFolders.add(pnpmDlxRoot);
    }
    try {
      const expoMetroRequirePath = require.resolve('@expo/cli/build/metro-require/require.js');
      watchFolders.add(path.dirname(expoMetroRequirePath));
    } catch {}
  }
  config.watchFolders = Array.from(watchFolders);

  const existingBlockList = resolver.blockList
    ? Array.isArray(resolver.blockList)
      ? resolver.blockList
      : [resolver.blockList]
    : [];
  const resolvedPlatforms = Array.isArray(resolver.platforms)
    ? resolver.platforms.includes('native')
      ? resolver.platforms
      : [...resolver.platforms, 'native']
    : ['ios', 'android', 'native'];
  config.resolver = {
    ...resolver,
    platforms: resolvedPlatforms,
    assetExts: [...resolver.assetExts.filter((ext) => ext !== 'svg'), 'onnx', 'data', 'bin'],
    sourceExts: [...resolver.sourceExts, 'svg'],
    nodeModulesPaths: [
      path.join(__dirname, 'node_modules'),
      path.join(__dirname, 'node_modules', '.pnpm', 'node_modules'),
    ],
    blockList: [
      ...existingBlockList,
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
