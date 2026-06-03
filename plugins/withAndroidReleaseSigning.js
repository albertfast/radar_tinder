const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING_BLOCK = `        release {
            storeFile file('../../@albertfast__radar-tinder.jks')
            storePassword '60e1270716eb0e15a2d03cf92e6e12ae'
            keyAlias '50bfc63f638af988fe807ff1eb2cd296'
            keyPassword '933b393230dc1659891255937bea56dc'
        }`;
const RELEASE_SIGNING_PATTERN = /^[ \t]*release\s*\{[\s\S]*?^[ \t]*\}/m;
const EXPECTED_PLAY_UPLOAD_SHA1 = '12:76:27:57:E2:93:B7:72:DA:A5:76:E1:6B:1C:51:20:94:3C:B9:43';

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

const RELEASE_UPLOAD_CERT_VERIFICATION_BLOCK = `def expectedPlayUploadCertSha1 = "${EXPECTED_PLAY_UPLOAD_SHA1}"

tasks.register("verifyReleaseUploadCertificate") {
    doLast {
        def releaseSigning = android.signingConfigs.release
        def keystoreFile = releaseSigning.storeFile
        if (keystoreFile == null || !keystoreFile.exists()) {
            throw new GradleException("Release keystore is missing. Expected Play upload SHA1: \${expectedPlayUploadCertSha1}")
        }

        def stdout = new ByteArrayOutputStream()
        exec {
            commandLine "keytool", "-list", "-v", "-keystore", keystoreFile.absolutePath, "-storepass", releaseSigning.storePassword, "-alias", releaseSigning.keyAlias
            standardOutput = stdout
            errorOutput = new ByteArrayOutputStream()
        }

        def matcher = stdout.toString("UTF-8") =~ /SHA1:\\s*([A-F0-9:]+)/
        if (!matcher.find()) {
            throw new GradleException("Could not read release upload certificate SHA1.")
        }

        def actualSha1 = matcher.group(1).toUpperCase()
        if (actualSha1 != expectedPlayUploadCertSha1) {
            throw new GradleException("Wrong release upload certificate. Expected \${expectedPlayUploadCertSha1}, got \${actualSha1}. Find the original Play upload keystore or request a Play upload key reset before building release.")
        }
    }
}

tasks.matching { task -> task.name in ["bundleRelease", "assembleRelease"] }.configureEach {
    dependsOn("verifyReleaseUploadCertificate")
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

function upsertDynamicVersionCodeBlock(contents) {
  const dynamicVersionCodePattern = /def resolveDynamicVersionCode = \{[\s\S]*?\n\}/m;

  if (dynamicVersionCodePattern.test(contents)) {
    return contents.replace(dynamicVersionCodePattern, DYNAMIC_VERSION_CODE_BLOCK);
  }

  if (contents.includes("def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'")) {
    return contents.replace(
      "def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'",
      `def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'\n\n${DYNAMIC_VERSION_CODE_BLOCK}`
    );
  }

  if (contents.includes('android {')) {
    return contents.replace('android {', `${DYNAMIC_VERSION_CODE_BLOCK}\n\nandroid {`);
  }

  return contents;
}

function useDynamicVersionCode(contents) {
  const defaultConfigRange = findBlockRange(contents, 'defaultConfig');
  if (!defaultConfigRange) {
    return contents;
  }

  const defaultConfigBlock = contents.slice(defaultConfigRange.start, defaultConfigRange.end);
  const patchedDefaultConfig = defaultConfigBlock.replace(
    /^(\s*)versionCode\s+.*$/m,
    '$1versionCode resolveDynamicVersionCode()'
  );

  return (
    contents.slice(0, defaultConfigRange.start) +
    patchedDefaultConfig +
    contents.slice(defaultConfigRange.end)
  );
}

function upsertReleaseUploadCertVerification(contents) {
  const verificationPattern =
    /\ndef expectedPlayUploadCertSha1 = "[^"]+"[\s\S]*?tasks\.matching \{ task -> task\.name in \["bundleRelease", "assembleRelease"\] \}\.configureEach \{\n    dependsOn\("verifyReleaseUploadCertificate"\)\n\}\n?/m;

  if (verificationPattern.test(contents)) {
    return contents.replace(verificationPattern, `\n${RELEASE_UPLOAD_CERT_VERIFICATION_BLOCK}\n`);
  }

  const androidRange = findBlockRange(contents, 'android');
  if (!androidRange) {
    return `${contents.trimEnd()}\n\n${RELEASE_UPLOAD_CERT_VERIFICATION_BLOCK}\n`;
  }

  return (
    contents.slice(0, androidRange.end) +
    `\n\n${RELEASE_UPLOAD_CERT_VERIFICATION_BLOCK}` +
    contents.slice(androidRange.end)
  );
}

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    contents = upsertDynamicVersionCodeBlock(contents);
    contents = useDynamicVersionCode(contents);
    contents = enforceReleaseOptimizationDefaults(contents);

    const signingConfigsRange = findBlockRange(contents, 'signingConfigs');
    if (signingConfigsRange) {
      const signingConfigsBlock = contents.slice(signingConfigsRange.start, signingConfigsRange.end);
      let patchedSigningConfigs = signingConfigsBlock;

      if (RELEASE_SIGNING_PATTERN.test(signingConfigsBlock)) {
        patchedSigningConfigs = signingConfigsBlock.replace(
          RELEASE_SIGNING_PATTERN,
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

    contents = upsertReleaseUploadCertVerification(contents);

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidReleaseSigning;
