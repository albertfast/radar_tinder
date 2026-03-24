import Constants from 'expo-constants';
import { Platform } from 'react-native';

type BuildExtra = {
  buildFingerprint?: string;
  buildTimestampMs?: string;
  gitCommitShort?: string;
  ortAndroidVersion?: string;
};

const expoConfigExtra =
  (Constants.expoConfig?.extra as BuildExtra | undefined) ??
  (((Constants as any).manifest2?.extra || (Constants as any).manifest?.extra) as
    | BuildExtra
    | undefined) ??
  {};

const asString = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

export const buildFingerprint = asString(expoConfigExtra.buildFingerprint, 'unknown');
export const buildTimestampMs = asString(expoConfigExtra.buildTimestampMs, 'unknown');
export const gitCommitShort = asString(expoConfigExtra.gitCommitShort, 'unknown');
export const ortAndroidVersion = asString(expoConfigExtra.ortAndroidVersion, '1.23.2');

export const appVersion = asString(Constants.expoConfig?.version, 'unknown');
export const nativeBuildVersion = asString(Constants.nativeBuildVersion, 'unknown');
export const runtimeVersion = asString(
  (Constants.expoConfig as any)?.runtimeVersion,
  Platform.OS === 'android' ? `android-${appVersion}` : `ios-${appVersion}`
);

