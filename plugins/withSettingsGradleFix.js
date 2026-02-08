const { withSettingsGradle } = require('expo/config-plugins');

/**
 * Plugin to fix settings.gradle missing commandLine
 * Expo SDK 54 template bug: first providers.exec block is missing commandLine
 */
function withSettingsGradleFix(config) {
  return withSettingsGradle(config, (config) => {
    let content = config.modResults.contents;
    
    const nodeBinaryLine = 'def nodeBinary = System.getenv("NODE_BINARY") ?: "node"';

    // We target the exact block that defines reactNativeGradlePlugin
    const brokenBlock = /def\s+reactNativeGradlePlugin\s*=\s*new\s+File\(\s*providers\.exec\s*\{\s*workingDir\(rootDir\)\s*\}\.standardOutput\.asText\.get\(\)\.trim\(\)\s*\)/;
    
    if (content.match(brokenBlock)) {
      console.log('[SettingsGradleFix] Detected broken reactNativeGradlePlugin block. Fixing...');
      const fixedBlock = `def reactNativeGradlePlugin = new File(
    providers.exec {
      workingDir(rootDir)
      commandLine(nodeBinary, "--print", "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })")
    }.standardOutput.asText.get().trim()
  )`;
      
      content = content.replace(brokenBlock, fixedBlock);
      config.modResults.contents = content;
      console.log('✅ [SettingsGradleFix] Successfully patched settings.gradle');
    } else {
      // Check if it's already fixed in THIS specific block
      if (content.includes("commandLine(\"node\", \"--print\", \"require.resolve('@react-native/gradle-plugin/package.json'") || content.includes('commandLine(nodeBinary, "--print", "require.resolve(\'@react-native/gradle-plugin/package.json\'')) {
           console.log('ℹ️ [SettingsGradleFix] settings.gradle already contains the specific fix');
      } else {
           console.log('⚠️ [SettingsGradleFix] Pattern mismatch. Checking alternative syntax...');
           // Fallback to a broader match if the template varies slightly
           const broaderMatch = /def\s+reactNativeGradlePlugin\s*=\s*new\s+File\(\s*providers\.exec\s*\{\s*workingDir\(rootDir\)\s*\}[\s\S]*?\.trim\(\)\s*\)/;
           if (content.match(broaderMatch)) {
                console.log('[SettingsGradleFix] Found match with broader regex. Patching...');
                content = content.replace(broaderMatch, fixedBlock);
                config.modResults.contents = content;
                console.log('✅ [SettingsGradleFix] Patched via broader regex');
           }
      }
    }

    if (!content.includes(nodeBinaryLine)) {
      content = content.replace(/pluginManagement\s*\{/, `pluginManagement {\n  ${nodeBinaryLine}`);
    }

    content = content.replace(/commandLine\(\"node\",/g, 'commandLine(nodeBinary,');
    
    return config;
  });
}

module.exports = withSettingsGradleFix;
