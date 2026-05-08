const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fixes Xcode 16/16.1 consteval errors when building the 'fmt' pod by forcing c++17.
 */
module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(file, 'utf8');

      const fmtPatch = `
      if target.name == 'fmt'
        target.build_configurations.each do |config|
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end
`;

      if (!contents.includes("target.name == 'fmt'")) {
        // Insert inside the installer.pods_project.targets.each loop
        contents = contents.replace(
          /installer\.pods_project\.targets\.each do \|target\|/g,
          `installer.pods_project.targets.each do |target|${fmtPatch}`
        );
        fs.writeFileSync(file, contents);
      }

      return config;
    },
  ]);
};
