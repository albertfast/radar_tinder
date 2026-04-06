import { Platform } from 'react-native';
import { readBooleanFlag } from '../utils/flags';

export const APP_DISPLAY_NAME = 'Radar Scout';
export const APP_DEVELOPER_NAME = 'Aether Labs';
export const APP_SUPPORT_EMAIL = 'aetherlabsapps@gmail.com';

export const APP_PRIVACY_POLICY_URL =
  'https://albertfast.github.io/radar_tinder/privacy-policy';
export const APP_TERMS_URL =
  'https://albertfast.github.io/radar_tinder/terms-and-conditions';
export const APP_STANDARD_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

const IOS_BLOCKING_ADS_OVERRIDE = readBooleanFlag(
  'EXPO_PUBLIC_IOS_BLOCKING_ADS_ENABLED',
  false
);

export const BLOCKING_ADS_ENABLED =
  Platform.OS !== 'ios' || __DEV__ || IOS_BLOCKING_ADS_OVERRIDE;
