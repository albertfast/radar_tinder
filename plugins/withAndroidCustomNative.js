const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
  withMainApplication,
} = require('expo/config-plugins');

const NATIVE_SOURCE_DIR = path.join(
  __dirname,
  'android-native',
  'src',
  'main',
  'java',
  'com',
  'radartinder',
  'app'
);

const NATIVE_PACKAGE_DIRS = ['driving', 'radarlife', 'ui'];
const MAIN_APPLICATION_IMPORTS = [
  'import com.radartinder.app.radarlife.RadarLifePackage',
  'import com.radartinder.app.ui.UIPackage',
];
const MAIN_APPLICATION_PACKAGES = ['add(RadarLifePackage())', 'add(UIPackage())'];
const OPTIONAL_ANDROID_FEATURES = [
  'android.hardware.location.gps',
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.microphone',
];

const setGradleProperty = (properties, key, value) => {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
    return;
  }

  properties.push({ type: 'property', key, value });
};

const ensureImports = (source) => {
  const missingImports = MAIN_APPLICATION_IMPORTS.filter((line) => !source.includes(line));
  if (!missingImports.length) {
    return source;
  }

  const importAnchor = source.includes('import ai.onnxruntime.reactnative.OnnxruntimePackage')
    ? 'import ai.onnxruntime.reactnative.OnnxruntimePackage'
    : 'import com.facebook.react.defaults.DefaultReactNativeHost';

  if (!source.includes(importAnchor)) {
    return `${missingImports.join('\n')}\n${source}`;
  }

  return source.replace(importAnchor, `${importAnchor}\n${missingImports.join('\n')}`);
};

const ensurePackageCalls = (source) => {
  let patched = source;
  for (const packageCall of MAIN_APPLICATION_PACKAGES) {
    if (patched.includes(packageCall)) {
      continue;
    }

    if (patched.includes('add(OnnxruntimePackage())')) {
      patched = patched.replace('add(OnnxruntimePackage())', `add(OnnxruntimePackage())\n              ${packageCall}`);
    } else {
      patched = patched.replace(
        '// add(MyReactNativePackage())',
        `// add(MyReactNativePackage())\n              ${packageCall}`
      );
    }
  }

  return patched;
};

module.exports = function withAndroidCustomNative(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] || [];

    for (const featureName of OPTIONAL_ANDROID_FEATURES) {
      const existing = manifest['uses-feature'].find(
        (feature) => feature?.$?.['android:name'] === featureName
      );

      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        manifest['uses-feature'].push({
          $: {
            'android:name': featureName,
            'android:required': 'false',
          },
        });
      }
    }

    return config;
  });

  config = withGradleProperties(config, (config) => {
    setGradleProperty(config.modResults, 'reactNativeArchitectures', 'armeabi-v7a,arm64-v8a');
    setGradleProperty(config.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    setGradleProperty(config.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    return config;
  });

  config = withMainApplication(config, (config) => {
    if (config.modResults.language !== 'kt') {
      return config;
    }

    let source = config.modResults.contents;
    source = ensureImports(source);
    source = ensurePackageCalls(source);
    config.modResults.contents = source;
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'radartinder',
        'app'
      );

      for (const dirName of NATIVE_PACKAGE_DIRS) {
        const sourceDir = path.join(NATIVE_SOURCE_DIR, dirName);
        const destinationDir = path.join(targetDir, dirName);
        if (!fs.existsSync(sourceDir)) {
          throw new Error(`[withAndroidCustomNative] Missing native source directory: ${sourceDir}`);
        }

        fs.rmSync(destinationDir, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(destinationDir), { recursive: true });
        fs.cpSync(sourceDir, destinationDir, { recursive: true });
      }

      return config;
    },
  ]);

  return config;
};
