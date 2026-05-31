import { Linking, Platform } from 'react-native';

const ANDROID_PACKAGE = 'com.radartinder.app';

export const openManageSubscriptions = async (): Promise<boolean> => {
  const url =
    Platform.OS === 'android'
      ? `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`
      : 'https://apps.apple.com/account/subscriptions';

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
};
