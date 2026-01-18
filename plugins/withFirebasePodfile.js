const { withDangerousMod } = require('@expo/config-plugins');
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
      
      // Add modular_headers for GoogleUtilities specifically (main culprit)
      // This is added after use_react_native but before the target closes
      const modularHeadersPods = `
  # Fix Firebase Swift pods - add modular headers to specific dependencies
  pod 'GoogleUtilities', :modular_headers => true
  pod 'FirebaseCore', :modular_headers => true
  pod 'FirebaseCoreInternal', :modular_headers => true
`;

      // Find the main target block and add our pods
      // Look for the pattern "use_react_native!(" and add after its closing block
      if (!podfileContent.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        // Add before the first "end" that closes the target block
        // Find "target 'RadarTinder' do" and add before its closing "end"
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
