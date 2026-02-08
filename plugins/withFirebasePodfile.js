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

      if (!podfileContent.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
        const mapsWorkaround = `
    # Workaround: Xcode 26 strict modular header checks in static framework pods
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        # Some pods (RNFirebase, etc.) import React headers and fail under framework modular checks.
        build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        # Ensure @import-based pods (e.g. Google-Maps-iOS-Utils) keep modules enabled.
        build_config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
      end
    end
`;

        let nextContent = podfileContent.replace(
          /\n  end\s*\nend\s*$/,
          `${mapsWorkaround}\n  end\nend\n`
        );

        // Fallback in case Podfile shape changes in a future Expo template.
        if (nextContent === podfileContent) {
          nextContent = podfileContent.replace(
            /(post_install do \|installer\|[\s\S]*?)\n  end/m,
            `$1${mapsWorkaround}\n  end`
          );
        }

        podfileContent = nextContent;
      }

      fs.writeFileSync(podfilePath, podfileContent);

      console.log('✅ Firebase + iOS Podfile workarounds applied');

      return config;
    },
  ]);
};
