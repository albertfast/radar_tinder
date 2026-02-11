const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Plugin to fix react-native-google-maps pod reference in generated Podfile.
 * 
 * The issue: When Expo auto-links packages, it sometimes detects and tries to
 * install 'react-native-google-maps' as a separate pod. However, react-native-maps@1.27.1
 * only has subspecs 'Maps' and 'Google' - there's no separate 'react-native-google-maps' pod.
 * 
 * This plugin removes any standalone references to 'react-native-google-maps' and ensures
 * only 'react-native-maps' with proper subspecs is used.
 */
module.exports = function withMapsPodfixPlugin(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      if (!fs.existsSync(podfilePath)) {
        console.log('⚠️ Podfile not found at', podfilePath);
        return config;
      }

      let podfileContent = fs.readFileSync(podfilePath, 'utf8');
      const originalContent = podfileContent;

      // Remove any reference to react-native-google-maps as a standalone pod
      // This regex looks for: pod 'react-native-google-maps', ...
      podfileContent = podfileContent.replace(
        /\s*pod\s+['"]react-native-google-maps['"]\s*,\s*[^\n]*\n/g,
        ''
      );

      // If the Podfile tries to install both maps and google-maps, clean it up
      // Ensure we only have one react-native-maps declaration with proper subspecs
      const mapsRegex = /pod\s+['"]react-native-maps['"]\s*,\s*:path\s*=>\s*[^,\n]*(?:,\s*:subspecs\s*=>\s*\[[^\]]*\])?/;
      const mapsMatches = podfileContent.match(/pod\s+['"]react-native-maps['"]/g);
      
      if (mapsMatches && mapsMatches.length > 1) {
        console.log('⚠️ Multiple react-native-maps declarations found, consolidating...');
        // Remove duplicates, keeping only the one with proper subspecs
        podfileContent = podfileContent.replace(mapsRegex, (match) => {
          if (match.includes('subspecs')) return match;
          // This is a duplicate without subspecs, remove it
          return '';
        });
      }

      // Ensure react-native-maps is declared with proper subspecs
      if (!podfileContent.includes('react-native-maps')) {
        console.log('⚠️ react-native-maps not found in Podfile, adding...');
        const mapsDeclaration = `
  # PNPM-compatible react-native-maps pods
  maps_path = File.join(__dir__, '..', 'node_modules', '.pnpm')
  maps_dirs = Dir.glob(File.join(maps_path, 'react-native-maps@*')).select { |dir| File.basename(dir).start_with?('react-native-maps@') }
  if maps_dirs.any?
    maps_path = File.join(maps_dirs.sort.first, 'node_modules', 'react-native-maps')
  else
    maps_path = File.join(__dir__, '..', 'node_modules', 'react-native-maps')
  end
  pod 'react-native-maps', :path => maps_path, :subspecs => ['Maps', 'Google'] if Dir.exist?(maps_path)
`;
        // Insert before the target definition
        podfileContent = podfileContent.replace(
          /^target\s+/m,
          mapsDeclaration + "\ntarget "
        );
      } else if (!podfileContent.includes(":subspecs")) {
        console.log('⚠️ react-native-maps missing subspecs, fixing...');
        podfileContent = podfileContent.replace(
          /pod\s+['"]react-native-maps['"]\s*,\s*:path\s*=>\s*([^,\n]*)/,
          "pod 'react-native-maps', :path => $1, :subspecs => ['Maps', 'Google']"
        );
      }

      if (podfileContent !== originalContent) {
        fs.writeFileSync(podfilePath, podfileContent);
        console.log('✅ Podfile fixed: Removed react-native-google-maps references, ensured react-native-maps with proper subspecs');
      }

      return config;
    },
  ]);
};
