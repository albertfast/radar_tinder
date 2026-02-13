const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING_BLOCK = `        release {
            storeFile file('../../@albertfast__radar-tinder.jks')
            storePassword '60e1270716eb0e15a2d03cf92e6e12ae'
            keyAlias '50bfc63f638af988fe807ff1eb2cd296'
            keyPassword '933b393230dc1659891255937bea56dc'
        }`;

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
