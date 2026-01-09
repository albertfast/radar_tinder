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
  const root = config.modRequest?.projectRoot || process.cwd();
  const agpVersion = readVersion(root, 'node_modules/react-native/gradle/libs.versions.toml', 'agp');
  const kotlinVersion = readVersion(root, 'node_modules/react-native/gradle/libs.versions.toml', 'kotlin');
  const rnVersion = readPackageVersion(root, 'node_modules/react-native/package.json');
  const rnMinor = rnVersion ? parseInt(rnVersion.split('-')[0].split('.')[1], 10) : null;
  const includeBuildLine =
    "includeBuild(new File([\"node\", \"--print\", \"require.resolve('@react-native/gradle-plugin/package.json')\"].execute(null, rootDir).text.trim()).getParentFile().toString())";

  config = withSettingsGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (rnMinor !== null && rnMinor < 75) {
      const lines = contents.split('\n');
      const filtered = [];
      let skipBlock = false;
      let braceDepth = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!skipBlock && trimmed.startsWith('pluginManagement')) {
          skipBlock = true;
          braceDepth += (line.match(/\{/g) || []).length;
          braceDepth -= (line.match(/\}/g) || []).length;
          if (braceDepth <= 0) {
            skipBlock = false;
            braceDepth = 0;
          }
          continue;
        }

        if (!skipBlock && trimmed.startsWith('plugins') && trimmed.includes('com.facebook.react.settings')) {
          // Single-line plugins block in the template.
          continue;
        }

        if (skipBlock) {
          braceDepth += (line.match(/\{/g) || []).length;
          braceDepth -= (line.match(/\}/g) || []).length;
          if (braceDepth <= 0) {
            skipBlock = false;
            braceDepth = 0;
          }
          continue;
        }

        filtered.push(line);
      }

      contents = filtered.join('\n');
    }

    if (contents.includes(DUPLICATE_MARKER)) {
      contents = contents
        .split('\n')
        .filter((line) => !line.includes(DUPLICATE_MARKER))
        .join('\n');
    }

    if (!contents.includes('@react-native/gradle-plugin')) {
      const includeAppRegex = /include\\s+['"]:\\s*app['"]/;
      if (includeAppRegex.test(contents)) {
        contents = contents.replace(
          includeAppRegex,
          `${includeBuildLine}\n\ninclude ':app'`
        );
      } else {
        contents = `${contents.trim()}\n\n${includeBuildLine}\n`;
      }
    }

    config.modResults.contents = contents;
    return config;
  });

  return withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    contents = patchClasspath(contents, 'com.android.tools.build:gradle', agpVersion);
    contents = patchClasspath(contents, 'org.jetbrains.kotlin:kotlin-gradle-plugin', kotlinVersion);

    config.modResults.contents = contents;
    return config;
  });
};

module.exports = withReactNativeGradlePluginFix;
