import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

const iosApiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const androidApiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

const resolveApiKey = () => (Platform.OS === 'ios' ? iosApiKey : androidApiKey);

export async function configureRevenueCat(userId) {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      'Missing RevenueCat API key. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY'
    );
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
  Purchases.configure({ apiKey });

  if (userId) {
    await Purchases.logIn(String(userId));
  }
}

export async function checkProEntitlement() {
  const customerInfo = await Purchases.getCustomerInfo();
  return typeof customerInfo?.entitlements?.active?.pro !== 'undefined';
}

export async function presentRevenueCatPaywall() {
  const result = await RevenueCatUI.presentPaywall();

  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
    case PAYWALL_RESULT.RESTORED:
      return true;
    case PAYWALL_RESULT.NOT_PRESENTED:
    case PAYWALL_RESULT.CANCELLED:
    case PAYWALL_RESULT.ERROR:
    default:
      return false;
  }
}

