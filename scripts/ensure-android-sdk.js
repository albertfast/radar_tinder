const fs = require('fs');
const os = require('os');
const path = require('path');

const root = process.cwd();
const androidDir = path.join(root, 'android');
const localPropertiesPath = path.join(androidDir, 'local.properties');

const fileExists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

const looksLikeAndroidSdkDir = (sdkDir) => {
  if (!sdkDir) return false;
  return (
    fileExists(path.join(sdkDir, 'platform-tools')) &&
    fileExists(path.join(sdkDir, 'platforms')) &&
    fileExists(path.join(sdkDir, 'build-tools'))
  );
};

const formatForLocalProperties = (p) => p.replace(/\\/g, '\\\\');

if (!fileExists(androidDir)) {
  process.exit(0);
}

if (fileExists(localPropertiesPath)) {
  process.exit(0);
}

const envSdkDir = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const candidateSdkDirs = [
  envSdkDir,
  path.join(os.homedir(), 'Android', 'Sdk'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
  '/opt/android-sdk',
  '/usr/lib/android-sdk',
];

const resolvedSdkDir = candidateSdkDirs.find(looksLikeAndroidSdkDir);

if (!resolvedSdkDir) {
  console.error('Android SDK not found.');
  console.error(
    'Set ANDROID_SDK_ROOT/ANDROID_HOME or create android/local.properties with `sdk.dir=/path/to/Android/Sdk`.'
  );
  process.exit(1);
}

try {
  fs.writeFileSync(
    localPropertiesPath,
    `sdk.dir=${formatForLocalProperties(resolvedSdkDir)}\n`,
    'utf8'
  );
  console.log(`Wrote ${path.relative(root, localPropertiesPath)} (sdk.dir=${resolvedSdkDir})`);
} catch (error) {
  console.error(`Failed to write ${localPropertiesPath}: ${error.message}`);
  process.exit(1);
}
