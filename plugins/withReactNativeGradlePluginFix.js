const fs = require('fs');
const path = require('path');
const { withProjectBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const DUPLICATE_MARKER =
  "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })";

const readVersion = (root, relativePath, key) => {
  try {
    const filePath = path.join(root, relativePath);
    const contents = fs.readFileSync(filePath, 'utf8');
    const match = contents.match(new RegExp(`${key}\\s*=\\s*\"([^\"]+)\"`));
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
};

const readPackageVersion = (root, relativePath) => {
  try {
    const filePath = path.join(root, relativePath);
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return pkg.version || null;
  } catch (error) {
    return null;
  }
};

const patchClasspath = (contents, coordinate, version) => {
  if (!version) return contents;
  const single = `classpath('${coordinate}')`;
  const double = `classpath(\"${coordinate}\")`;
  const versionedSingle = `classpath('${coordinate}:${version}')`;
  const versionedDouble = `classpath(\"${coordinate}:${version}\")`;

  if (contents.includes(versionedSingle) || contents.includes(versionedDouble)) {
    return contents;
  }

  return contents
    .replace(single, versionedSingle)
    .replace(double, versionedDouble);
};

const withReactNativeGradlePluginFix = (config) => {
  const root = config.modRequest.projectRoot;
  const agpVersion = readVersion(root, 'node_modules/react-native/gradle/libs.versions.toml', 'agp');
  const kotlinVersion = readVersion(root, 'node_modules/react-native/gradle/libs.versions.toml', 'kotlin');
  const rnGradlePluginVersion = readPackageVersion(root, 'node_modules/@react-native/gradle-plugin/package.json');

  config = withSettingsGradle(config, (config) => {
    const { contents } = config.modResults;
    if (!contents.includes(DUPLICATE_MARKER)) {
      return config;
    }

    const filtered = contents
      .split('\n')
      .filter((line) => !line.includes(DUPLICATE_MARKER))
      .join('\n');

    config.modResults.contents = filtered;
    return config;
  });

  return withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    contents = patchClasspath(contents, 'com.android.tools.build:gradle', agpVersion);
    contents = patchClasspath(contents, 'com.facebook.react:react-native-gradle-plugin', rnGradlePluginVersion);
    contents = patchClasspath(contents, 'org.jetbrains.kotlin:kotlin-gradle-plugin', kotlinVersion);

    config.modResults.contents = contents;
    return config;
  });
};

module.exports = withReactNativeGradlePluginFix;
