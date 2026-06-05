#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXPECTED_SHA1 = '8E:91:95:0F:1F:BB:64:06:37:15:E4:2B:8B:82:13:66:BA:03:28:C2';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');

function normalizeSha1(value) {
  return String(value || '').trim().toUpperCase();
}

function parseReleaseSigningConfig(contents) {
  const readBlock = (label, fromIndex = 0) => {
    const start = contents.indexOf(`${label} {`, fromIndex);
    if (start === -1) return null;

    const braceStart = contents.indexOf('{', start);
    let depth = 0;
    for (let index = braceStart; index < contents.length; index += 1) {
      const char = contents[index];
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      if (depth === 0) return contents.slice(braceStart + 1, index);
    }
    return null;
  };

  const signingConfigs = readBlock('signingConfigs');
  if (!signingConfigs) {
    throw new Error('android/app/build.gradle has no signingConfigs block.');
  }

  const release = readBlock('release', contents.indexOf('signingConfigs {'));
  if (!release) {
    throw new Error('android/app/build.gradle has no signingConfigs.release block.');
  }

  const pick = (name) => {
    const fileCall = release.match(new RegExp(`${name}\\s+file\\(['"]([^'"]+)['"]\\)`));
    const quoted = release.match(new RegExp(`${name}\\s+['"]([^'"]+)['"]`));
    return fileCall?.[1] ?? quoted?.[1] ?? null;
  };

  const storeFile = pick('storeFile');
  const storePassword = pick('storePassword');
  const keyAlias = pick('keyAlias');

  if (!storeFile || !storePassword || !keyAlias) {
    throw new Error('Release signing config is incomplete.');
  }

  return {
    storeFile: path.resolve(path.dirname(buildGradlePath), storeFile),
    storePassword,
    keyAlias,
  };
}

function readKeystoreSha1({ storeFile, storePassword, keyAlias }) {
  if (!fs.existsSync(storeFile)) {
    throw new Error(`Release keystore does not exist: ${path.relative(projectRoot, storeFile)}`);
  }

  const output = execFileSync(
    'keytool',
    ['-list', '-v', '-keystore', storeFile, '-storepass', storePassword, '-alias', keyAlias],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const sha1 = output.match(/SHA1:\s*([A-F0-9:]+)/i)?.[1];
  if (!sha1) {
    throw new Error('Could not read SHA1 from release keystore.');
  }
  return normalizeSha1(sha1);
}

function readAabSha1(aabPath) {
  if (!fs.existsSync(aabPath)) {
    throw new Error(`AAB does not exist: ${aabPath}`);
  }

  const output = execFileSync('keytool', ['-printcert', '-jarfile', aabPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sha1 = output.match(/SHA1:\s*([A-F0-9:]+)/i)?.[1];
  if (!sha1) {
    throw new Error('Could not read SHA1 from AAB signer certificate.');
  }
  return normalizeSha1(sha1);
}

const aabArgIndex = process.argv.indexOf('--aab');
const aabPath =
  aabArgIndex >= 0 && process.argv[aabArgIndex + 1]
    ? path.resolve(process.cwd(), process.argv[aabArgIndex + 1])
    : null;

const actualSha1 = aabPath
  ? readAabSha1(aabPath)
  : readKeystoreSha1(parseReleaseSigningConfig(fs.readFileSync(buildGradlePath, 'utf8')));

if (actualSha1 !== EXPECTED_SHA1) {
  console.error(`[android-signing] Upload certificate mismatch. Expected ${EXPECTED_SHA1}, got ${actualSha1}.`);
  console.error('[android-signing] Find the original Play upload keystore or request a Play upload key reset before building a release AAB.');
  process.exit(1);
}

console.log(`[android-signing] Upload certificate OK: ${EXPECTED_SHA1}`);
