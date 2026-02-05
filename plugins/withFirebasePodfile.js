const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to fix Firebase Swift pods modular headers issue
 * without causing ReactCommon redefinition error.
 * 
 * This adds $RNFirebaseAsStaticFramework and pod-specific modular_headers
 */
module.exports = function withFirebasePodfile(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');
      
      // Add Firebase static framework flag at the very top before any requires
      if (!podfileContent.includes('$RNFirebaseAsStaticFramework')) {
        podfileContent = `# Firebase Static Framework - fixes Swift module issues
$RNFirebaseAsStaticFramework = true

` + podfileContent;
      }

      // Ensure we enable modular headers globally so Swift pods can be imported from static libs
      /*
      if (!podfileContent.includes('use_modular_headers!')) {
        // Insert after $FirebaseSDKVersion declaration if present, otherwise at top
        if (podfileContent.includes("$FirebaseSDKVersion")) {
          podfileContent = podfileContent.replace(/(\$FirebaseSDKVersion\s*=\s*[^\n]*\n)/, `$1use_modular_headers!\n`);
        } else {
          podfileContent = `use_modular_headers!\n\n` + podfileContent;
        }
      }
      */
      
      // Add modular_headers for specific Firebase-related dependencies
      // This is added before the target's closing 'end'
      const modularHeadersPods = `
  # Fix Firebase Swift pods - add modular headers to specific dependencies
  pod 'GoogleUtilities', '~> 7.13', :modular_headers => true
  pod 'FirebaseCore', '~> 10.29.0', :modular_headers => true
  pod 'FirebaseCoreInternal', :modular_headers => true
  pod 'FirebaseInstallations', '~> 10.29.0', :modular_headers => true
  pod 'GoogleDataTransport', :modular_headers => true
  pod 'nanopb', :modular_headers => true
  pod 'FirebaseCoreExtension', '~> 10.29.0', :modular_headers => true
`;

      // Find the main target block and add our pods if not already present
      if (!podfileContent.includes("pod 'GoogleUtilities', '~> 7.13', :modular_headers => true")) {
        podfileContent = podfileContent.replace(
          /(target\s+['"]RadarTinder['"]\s+do[\s\S]*?)(^end)/m,
          `$1${modularHeadersPods}\n$2`
        );
      }
      
      fs.writeFileSync(podfilePath, podfileContent);
      
      console.log('✅ Firebase Podfile plugin applied successfully');
      
      return config;
    },
  ]);
};
