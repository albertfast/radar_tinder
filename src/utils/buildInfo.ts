import Constants from 'expo-constants';
import { Platform } from 'react-native';

type BuildExtra = {
  buildFingerprint?: string;
  buildTimestampMs?: string;
  gitCommitShort?: string;
  ortAndroidVersion?: string;
  nativeBuildVersion?: string | number;
};

const expoConfigExtra =
  (Constants.expoConfig?.extra as BuildExtra | undefined) ??
  (((Constants as any).manifest2?.extra || (Constants as any).manifest?.extra) as
    | BuildExtra
    | undefined) ??
  {};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const asString = (value: unknown, fallback: string) => toOptionalString(value) ?? fallback;

export const buildFingerprint = asString(expoConfigExtra.buildFingerprint, 'unknown');
export const buildTimestampMs = asString(expoConfigExtra.buildTimestampMs, 'unknown');
export const gitCommitShort = asString(expoConfigExtra.gitCommitShort, 'unknown');
export const ortAndroidVersion = asString(expoConfigExtra.ortAndroidVersion, '1.23.2');

export const appVersion = asString(Constants.expoConfig?.version, 'unknown');
export const nativeBuildVersion =
  toOptionalString(Constants.nativeBuildVersion) ??
  toOptionalString((Constants.expoConfig as any)?.ios?.buildNumber) ??
  toOptionalString((Constants.expoConfig as any)?.android?.versionCode) ??
  toOptionalString(expoConfigExtra.nativeBuildVersion) ??
  appVersion;
export const runtimeVersion = asString(
  (Constants.expoConfig as any)?.runtimeVersion,
  Platform.OS === 'android' ? `android-${appVersion}` : `ios-${appVersion}`
);
