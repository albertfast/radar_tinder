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
  pod 'GoogleUtilities', '~> 8.1', :modular_headers => true
  pod 'FirebaseCore', '~> 12.8.0', :modular_headers => true
  pod 'FirebaseCoreInternal', '~> 12.8.0', :modular_headers => true
  pod 'FirebaseInstallations', '~> 12.8.0', :modular_headers => true
  pod 'GoogleDataTransport', :modular_headers => true
  pod 'nanopb', :modular_headers => true
  pod 'FirebaseCoreExtension', '~> 12.8.0', :modular_headers => true
  pod 'FirebaseAuthInterop', :modular_headers => true
  pod 'FirebaseAppCheckInterop', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
`;

      // Find the main target block and add our pods if not already present
      if (!podfileContent.includes("# Fix Firebase Swift pods - add modular headers to specific dependencies")) {
        const endIndex = podfileContent.lastIndexOf('\nend');
        if (endIndex !== -1) {
          podfileContent =
            podfileContent.slice(0, endIndex) +
            modularHeadersPods +
            podfileContent.slice(endIndex);
        } else {
          podfileContent += modularHeadersPods;
        }
      }
      
      fs.writeFileSync(podfilePath, podfileContent);
      
      console.log('✅ Firebase Podfile plugin applied successfully');
      
      return config;
    },
  ]);
};
