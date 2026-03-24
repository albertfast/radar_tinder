const fs = require('fs');
const path = require('path');
const {
  withSettingsGradle,
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require('expo/config-plugins');

const DEFAULT_ORT_ANDROID_VERSION = '1.23.2';

const resolveOrtAndroidVersion = () => {
  const raw = (process.env.EXPO_PUBLIC_ORT_ANDROID_VERSION || DEFAULT_ORT_ANDROID_VERSION).trim();
  return raw || DEFAULT_ORT_ANDROID_VERSION;
};

const pinOnnxRuntimeAndroidBuildGradle = (projectRoot, ortVersion) => {
  const ortBuildGradlePath = path.join(
    projectRoot,
    'node_modules',
    'onnxruntime-react-native',
    'android',
    'build.gradle'
  );

  if (!fs.existsSync(ortBuildGradlePath)) {
    console.warn(
      '[withOnnxRuntime] onnxruntime-react-native/android/build.gradle not found, skipping version pin.'
    );
    return;
  }

  const original = fs.readFileSync(ortBuildGradlePath, 'utf8');
  let patched = original;
  patched = patched.replace(
    /com\.microsoft\.onnxruntime:onnxruntime-android:latest\.integration@aar/g,
    `com.microsoft.onnxruntime:onnxruntime-android:${ortVersion}@aar`
  );
  patched = patched.replace(
    /com\.microsoft\.onnxruntime:onnxruntime-extensions-android:latest\.integration@aar/g,
    `com.microsoft.onnxruntime:onnxruntime-extensions-android:${ortVersion}@aar`
  );

  if (patched === original) {
    return;
  }

  fs.writeFileSync(ortBuildGradlePath, patched);
  console.log(`[withOnnxRuntime] Pinned Android ONNX Runtime artifacts to ${ortVersion}.`);
};

const ensureOrtResolutionStrategy = (gradle, ortVersion) => {
  if (gradle.includes("details.requested.group == 'com.microsoft.onnxruntime'")) {
    return gradle;
  }

  const block = `configurations.all {\n  resolutionStrategy.eachDependency { details ->\n    if (details.requested.group == 'com.microsoft.onnxruntime') {\n      details.useVersion('${ortVersion}')\n      details.because('Pin ORT native artifacts for deterministic and 16 KB-safe builds')\n    }\n  }\n}`;

  if (gradle.includes('android {')) {
    return gradle.replace('android {', `${block}\n\nandroid {`);
  }

  return `${block}\n\n${gradle}`;
};

/**
 * Force-link onnxruntime-react-native on Android.
 * Autolinking occasionally misses it under pnpm + new architecture,
 * which leaves the native module unavailable at runtime.
 */
module.exports = function withOnnxRuntime(config) {
  const ortVersion = resolveOrtAndroidVersion();

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
    gradle = ensureOrtResolutionStrategy(gradle, ortVersion);
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

  // Pin dynamic ORT Android artifacts in the library module itself.
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      pinOnnxRuntimeAndroidBuildGradle(config.modRequest.projectRoot, ortVersion);
      return config;
    },
  ]);

  return config;
};
