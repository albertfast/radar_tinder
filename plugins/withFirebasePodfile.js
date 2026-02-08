const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin for React Native Firebase iOS static frameworks.
 *
 * Keep this minimal to avoid brittle Podfile mutations across Expo/RN upgrades.
 */
module.exports = function withFirebasePodfile(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      let podfileContent = fs.readFileSync(podfilePath, 'utf8');

      // Add Firebase static framework flag at the very top before any requires.
      if (!podfileContent.includes('$RNFirebaseAsStaticFramework')) {
        podfileContent = `# Firebase Static Framework - fixes Swift module issues
$RNFirebaseAsStaticFramework = true

` + podfileContent;
      }

      fs.writeFileSync(podfilePath, podfileContent);

      console.log('✅ Firebase Podfile static framework flag applied');

      return config;
    },
  ]);
};
