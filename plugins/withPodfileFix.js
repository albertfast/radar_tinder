const { withPodfile } = require('expo/config-plugins');

/**
 * Fixes the Podfile after Expo generates it.
 *
 * react-native-maps has two iOS layouts across versions:
 * - <= 1.20.x: uses `react-native-google-maps.podspec`
 * - newer: may expose Google via `react-native-maps` subspecs
 *
 * This plugin rewrites Expo's generated block to handle both safely.
 */
module.exports = function withPodfileFix(config) {
  return withPodfile(config, (config) => {
    let content = config.modResults.contents;
    const original = content;

    // Rewrite generated react-native-maps block to a version-aware pod declaration.
    // Keep begin/end markers intact for idempotent prebuild sync.
    const mapsBlockRegex =
      /(#[ \t]*@generated begin react-native-maps[^\n]*\n)([\s\S]*?)(#[ \t]*@generated end react-native-maps)/;

    content = content.replace(mapsBlockRegex, (_match, begin, _body, end) => {
      const fixedBody = [
        "  rn_maps_path = File.dirname(`node --print \"require.resolve('react-native-maps/package.json')\"`)",
        "  if File.exist?(File.join(rn_maps_path, 'react-native-google-maps.podspec'))",
        "    pod 'react-native-google-maps', :path => rn_maps_path",
        "  else",
        "    pod 'react-native-maps', :path => rn_maps_path, :subspecs => ['Maps', 'Google']",
        "  end",
        '',
      ].join('\n');
      return `${begin}${fixedBody}${end}`;
    });

    if (content !== original) {
      config.modResults.contents = content;
      console.log(
        '✅ Fixed Podfile: react-native-maps Google pod block normalized for current package version'
      );
    }

    return config;
  });
};
