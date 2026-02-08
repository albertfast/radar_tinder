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
    # Workaround: react-native-maps with use_frameworks! :linkage => :static
    installer.pods_project.targets.each do |target|
      if target.name.start_with?('RNFB')
        target.build_configurations.each do |build_config|
          # RNFirebase headers import React headers that are treated as non-modular under frameworks.
          build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        end
      end

      if ['react-native-google-maps', 'react-native-maps'].include?(target.name)
        target.build_configurations.each do |build_config|
          # Keep modules enabled for Google-Maps-iOS-Utils (@import GoogleMaps).
          build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
          build_config.build_settings['DEFINES_MODULE'] = 'NO'
        end
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
