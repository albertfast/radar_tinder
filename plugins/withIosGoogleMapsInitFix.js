const { withAppDelegate } = require('expo/config-plugins');

/**
 * Ensures Google Maps SDK is initialized before React Native startup.
 *
 * On iOS 26 + Xcode 26 builds, initializing maps too late can trigger
 * strict main-thread init assertions from Google Maps internals and crash
 * immediately on app launch.
 */
module.exports = function withIosGoogleMapsInitFix(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      return config;
    }

    let src = config.modResults.contents;

    // Defensive guard: avoid startup abort if Firebase is configured twice.
    src = src.replace(
      /(^\s*)FirebaseApp\.configure\(\)\s*$/m,
      '$1if FirebaseApp.app() == nil {\n$1  FirebaseApp.configure()\n$1}'
    );

    const blockRegex =
      /\/\/ @generated begin react-native-maps-init[\s\S]*?\/\/ @generated end react-native-maps-init[^\n]*\n?/m;

    const mapsInitBlock = `// @generated begin react-native-maps-init - expo prebuild (DO NOT MODIFY) sync-custom-mainthread-init
#if canImport(GoogleMaps)
if let mapsApiKey = Bundle.main.object(forInfoDictionaryKey: "GMSApiKey") as? String, !mapsApiKey.isEmpty {
  GMSServices.provideAPIKey(mapsApiKey)
}
#endif
// @generated end react-native-maps-init`;

    // Normalize existing generated block content to plist-based API key init.
    if (blockRegex.test(src)) {
      src = src.replace(blockRegex, `${mapsInitBlock}\n`);
    } else if (!src.includes('GMSServices.provideAPIKey(')) {
      // If no maps init block exists, insert one before RN startup.
      const startCall = 'factory.startReactNative(';
      const startIndex = src.indexOf(startCall);
      if (startIndex !== -1) {
        src = `${src.slice(0, startIndex)}${mapsInitBlock}\n    ${src.slice(startIndex)}`;
      }
    }

    // Ensure maps init appears before React startup.
    const startCall = 'factory.startReactNative(';
    const startIndex = src.indexOf(startCall);
    const blockIndex = src.indexOf(mapsInitBlock);
    if (startIndex !== -1 && blockIndex !== -1 && blockIndex > startIndex) {
      src = src.replace(`${mapsInitBlock}\n`, '');
      const updatedStartIndex = src.indexOf(startCall);
      src = `${src.slice(0, updatedStartIndex)}${mapsInitBlock}\n    ${src.slice(updatedStartIndex)}`;
    }

    config.modResults.contents = src;
    return config;
  });
};
