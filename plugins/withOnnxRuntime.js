const {
  withSettingsGradle,
  withAppBuildGradle,
  withMainApplication,
} = require('expo/config-plugins');

/**
 * Force-link onnxruntime-react-native on Android.
 * Autolinking occasionally misses it under pnpm + new architecture,
 * which leaves the native module unavailable at runtime.
 */
module.exports = function withOnnxRuntime(config) {
  // Ensure settings.gradle includes the project.
  config = withSettingsGradle(config, (config) => {
    const settings = config.modResults.contents;
    const includeLine = "include ':onnxruntime-react-native'";
    const projectLine =
      "project(':onnxruntime-react-native').projectDir = new File(rootProject.projectDir, '../node_modules/onnxruntime-react-native/android')";

    if (!settings.includes(includeLine)) {
      config.modResults.contents += `\n${includeLine}\n${projectLine}\n`;
    }

    return config;
  });

  // Add dependency to app/build.gradle.
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    let gradle = config.modResults.contents;
    const depLine = "    implementation project(':onnxruntime-react-native')";
    if (!gradle.match(/implementation project\(':onnxruntime-react-native'\)/)) {
      gradle = gradle.replace(/dependencies\s*\{\s*\n?/, (match) => {
        // Ensure there's a newline before we insert
        const suffix = match.endsWith('\n') ? '' : '\n';
        return `${match}${suffix}${depLine}\n`;
      });
    }
    // Deduplicate in case another plugin already added it.
    const seen = { dep: false };
    gradle = gradle
      .split('\n')
      .filter((line) => {
        const isDep = line.includes("implementation project(':onnxruntime-react-native')");
        if (!isDep) return true;
        if (seen.dep) return false;
        seen.dep = true;
        return true;
      })
      .join('\n');
    // Ensure a clean newline after the dependencies { line
    gradle = gradle.replace(/dependencies\s*\{\s*(?=\S)/, 'dependencies {\n');
    config.modResults.contents = gradle;
    return config;
  });

  // Manually add the package to MainApplication (Kotlin).
  config = withMainApplication(config, (config) => {
    if (config.modResults.language !== 'kt') return config;
    let src = config.modResults.contents;

    const importLine = 'import ai.onnxruntime.reactnative.OnnxruntimePackage';
    if (!src.includes(importLine)) {
      src = src.replace(
        /import com\.facebook\.react\.defaults\.DefaultReactNativeHost/,
        (match) => `${match}\n${importLine}`
      );
    }

    if (!src.includes('OnnxruntimePackage()')) {
      const packageMarker = /PackageList\(this\)\.packages\.apply\s*\{\n([^}]*)\n\s*\}/m;
      src = src.replace(packageMarker, (match, inner) => {
        const insertion = inner.includes('OnnxruntimePackage()')
          ? inner
          : `${inner}\n              add(OnnxruntimePackage())`;
        return match.replace(inner, insertion);
      });
    }

    config.modResults.contents = src;
    return config;
  });

  return config;
};
