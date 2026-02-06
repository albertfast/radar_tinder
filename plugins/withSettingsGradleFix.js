/**
 * Plugin to fix settings.gradle missing commandLine
 * Expo SDK 54 template has a bug where the first providers.exec block is missing commandLine
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withSettingsGradleFix(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const settingsPath = path.join(
        config.modRequest.platformProjectRoot,
        'settings.gradle'
      );

      if (fs.existsSync(settingsPath)) {
        let content = fs.readFileSync(settingsPath, 'utf-8');

        // Check if first exec block is missing commandLine
        const brokenPattern = /providers\.exec \{\s*\n\s*workingDir\(rootDir\)\s*\n\s*\}\.standardOutput/;
        const fixedPattern = `providers.exec {
      workingDir(rootDir)
      commandLine("node", "--print", "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })")
    }.standardOutput`;

        if (brokenPattern.test(content)) {
          content = content.replace(brokenPattern, fixedPattern);
          fs.writeFileSync(settingsPath, content);
          console.log('✅ Fixed settings.gradle missing commandLine');
        }
      }

      return config;
    },
  ]);
}

module.exports = withSettingsGradleFix;
