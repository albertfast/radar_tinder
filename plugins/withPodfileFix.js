const { withPodfile } = require('expo/config-plugins');

/**
 * Fixes the Podfile after Expo generates it.
 *
 * - Expo's built-in react-native-maps config plugin still injects the deprecated
 *   `react-native-google-maps` pod, which no longer exists in 1.27.x.
 * - This mod rewrites the generated block to use the supported
 *   `react-native-maps` pod with the `Google` subspec instead.
 * - It also strips any lingering `react-native-google-maps` lines for safety.
 */
module.exports = function withPodfileFix(config) {
  return withPodfile(config, (config) => {
    let content = config.modResults.contents;
    const original = content;

    // Rewrite the generated react-native-maps block to the correct pod.
    // We preserve the begin/end markers (and the sync hash) so future prebuilds stay idempotent.
    const mapsBlockRegex =
      /(#[ \t]*@generated begin react-native-maps[^\n]*\n)([\s\S]*?)(#[ \t]*@generated end react-native-maps)/;

    content = content.replace(mapsBlockRegex, (_match, begin, _body, end) => {
      const fixedBody = [
        "  rn_maps_path = File.dirname(`node --print \"require.resolve('react-native-maps/package.json')\"`)",
        "  pod 'react-native-maps', :path => rn_maps_path, :subspecs => ['Maps', 'Google']",
        '',
      ].join('\n');
      return `${begin}${fixedBody}${end}`;
    });

    // Remove any standalone react-native-google-maps pod declarations that may remain.
    content = content.replace(
      /\s*pod\s+['"]react-native-google-maps['"]\s*,\s*[^\n]*\n/g,
      ''
    );

    if (content !== original) {
      config.modResults.contents = content;
      console.log(
        '✅ Fixed Podfile: using react-native-maps (Google subspec) instead of deprecated react-native-google-maps'
      );
    }

    return config;
  });
};
