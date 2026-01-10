import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeModules } from 'react-native';
import { AdService } from '../services/AdService';

interface AdBannerProps {
  size?: any;
}

let cachedGoogleMobileAds: any | undefined;
function getGoogleMobileAds(): any | null {
  if (cachedGoogleMobileAds !== undefined) return cachedGoogleMobileAds;
  const hasCoreModule = Boolean(NativeModules?.RNGoogleMobileAdsModule);
  if (!hasCoreModule) {
    cachedGoogleMobileAds = null;
    return cachedGoogleMobileAds;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BannerAd = require('react-native-google-mobile-ads/lib/commonjs/ads/BannerAd');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BannerAdSize = require('react-native-google-mobile-ads/lib/commonjs/BannerAdSize');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TestIds = require('react-native-google-mobile-ads/lib/commonjs/TestIds');
    cachedGoogleMobileAds = {
      BannerAd: BannerAd?.BannerAd ?? BannerAd?.default,
      BannerAdSize: BannerAdSize?.BannerAdSize ?? BannerAdSize?.default,
      TestIds: TestIds?.TestIds ?? TestIds?.default,
    };
  } catch (error) {
    cachedGoogleMobileAds = null;
  }
  return cachedGoogleMobileAds;
}

const AdBanner: React.FC<AdBannerProps> = ({ size }) => {
  if (!AdService.shouldShowAds()) {
    return null;
  }

  const googleMobileAds = getGoogleMobileAds();
  const BannerAd = googleMobileAds?.BannerAd;
  const BannerAdSize = googleMobileAds?.BannerAdSize;
  const TestIds = googleMobileAds?.TestIds;
  if (!BannerAd || !BannerAdSize || !TestIds) return null;

  const resolvedSize = size ?? BannerAdSize.ANCHORED_ADAPTIVE_BANNER;

  // Using Test ID for development
  const adUnitId = __DEV__ ? TestIds.BANNER : 'ca-app-pub-3940256099942544/6300978111';

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={adUnitId}
        size={resolvedSize}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdFailedToLoad={(error: unknown) => {
          console.error('Ad failed to load: ', error);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: 'transparent',
  },
});

export default AdBanner;
