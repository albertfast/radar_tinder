const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING_BLOCK = `        release {
            storeFile file('../../@albertfast__radar-tinder.jks')
            storePassword '60e1270716eb0e15a2d03cf92e6e12ae'
            keyAlias '50bfc63f638af988fe807ff1eb2cd296'
            keyPassword '933b393230dc1659891255937bea56dc'
        }`;

const DYNAMIC_VERSION_CODE_BLOCK = `def resolveDynamicVersionCode = {
    def explicitVersionCode = findProperty('android.versionCode') ?: System.getenv('ANDROID_VERSION_CODE')
    if (explicitVersionCode != null && explicitVersionCode.toString().trim()) {
        try {
            return Integer.parseInt(explicitVersionCode.toString().trim())
        } catch (ignored) {
            println "Invalid explicit android.versionCode='\${explicitVersionCode}', falling back to timestamp-based value."
        }
    }

    long nowSeconds = System.currentTimeMillis() / 1000L
    long candidate = nowSeconds + 300000000L
    long maxAllowed = Integer.MAX_VALUE - 1L
    if (candidate > maxAllowed) {
        return maxAllowed as int
    }
    return candidate as int
}`;

function enforceReleaseOptimizationDefaults(contents) {
  return contents
    .replace(
      /def enableMinifyInReleaseBuilds = \(findProperty\('android\.enableMinifyInReleaseBuilds'\) \?: (true|false)\)\.toBoolean\(\)/,
      "def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: true).toBoolean()"
    )
    .replace(
      /def enableShrinkResources = findProperty\('android\.enableShrinkResourcesInReleaseBuilds'\) \?: '(true|false)'/,
      "def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'true'"
    );
}

function findBlockRange(contents, blockName) {
  const blockStart = contents.indexOf(`${blockName} {`);
  if (blockStart === -1) return null;

  const openBrace = contents.indexOf('{', blockStart);
  if (openBrace === -1) return null;

  let depth = 0;
  for (let i = openBrace; i < contents.length; i += 1) {
    const ch = contents[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) {
      return { start: blockStart, end: i + 1 };
    }
  }
  return null;
}

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes('def resolveDynamicVersionCode = {')) {
      if (contents.includes("def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'")) {
        contents = contents.replace(
          "def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'",
          `def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'\n\n${DYNAMIC_VERSION_CODE_BLOCK}`
        );
      } else if (contents.includes('android {')) {
        contents = contents.replace('android {', `${DYNAMIC_VERSION_CODE_BLOCK}\n\nandroid {`);
      }
    }

    contents = contents.replace(
      /(targetSdkVersion[^\n]*\n)\s*versionCode[^\n]*\n/g,
      '$1        versionCode resolveDynamicVersionCode()\n'
    );
    contents = enforceReleaseOptimizationDefaults(contents);

    const signingConfigsRange = findBlockRange(contents, 'signingConfigs');
    if (signingConfigsRange) {
      const signingConfigsBlock = contents.slice(signingConfigsRange.start, signingConfigsRange.end);
      let patchedSigningConfigs = signingConfigsBlock;

      if (/release\s*\{[\s\S]*?\}/m.test(signingConfigsBlock)) {
        patchedSigningConfigs = signingConfigsBlock.replace(
          /release\s*\{[\s\S]*?\}/m,
          RELEASE_SIGNING_BLOCK
        );
      } else if (/debug\s*\{[\s\S]*?\}/m.test(signingConfigsBlock)) {
        patchedSigningConfigs = signingConfigsBlock.replace(
          /debug\s*\{[\s\S]*?\}/m,
          (debugBlock) => `${debugBlock}\n${RELEASE_SIGNING_BLOCK}`
        );
      }

      contents =
        contents.slice(0, signingConfigsRange.start) +
        patchedSigningConfigs +
        contents.slice(signingConfigsRange.end);
    }

    const buildTypesRange = findBlockRange(contents, 'buildTypes');
    if (buildTypesRange) {
      const buildTypesBlock = contents.slice(buildTypesRange.start, buildTypesRange.end);
      const patchedBuildTypes = buildTypesBlock.replace(
        /(release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.\w+/m,
        '$1signingConfig signingConfigs.release'
      );

      contents =
        contents.slice(0, buildTypesRange.start) +
        patchedBuildTypes +
        contents.slice(buildTypesRange.end);
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidReleaseSigning;
