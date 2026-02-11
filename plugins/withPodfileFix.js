const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fixes the Podfile after Expo generates it.
 * Removes react-native-google-maps pod references (which don't exist in react-native-maps 1.27.1)
 */
module.exports = function withPodfileFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      if (!fs.existsSync(podfilePath)) {
        console.log('⚠️ Podfile not found');
        return config;
      }

      let content = fs.readFileSync(podfilePath, 'utf8');
      const original = content;

      // Remove any standalone react-native-google-maps pod declarations
      content = content.replace(
        /\s*pod\s+['"]react-native-google-maps['"]\s*,\s*[^\n]*\n/g,
        ''
      );

      if (content !== original) {
        fs.writeFileSync(podfilePath, content);
        console.log('✅ Fixed: Removed react-native-google-maps from Podfile');
      }

      return config;
    },
  ]);
};
