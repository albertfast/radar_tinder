import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { AdService } from '../services/AdService';

interface AdBannerProps {
  size?: any;
  unitId?: string;
}

let cachedGoogleMobileAds: any | undefined;
const isTruthyFlag = (value?: string) => value === '1' || value === 'true' || value === 'yes';
const isAdDebugEnabled = () => __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_AD_DEBUG);
const isAdDebugOverlayEnabled = () => isTruthyFlag(process.env.EXPO_PUBLIC_AD_DEBUG_OVERLAY);
const shouldForceTestAdUnits = () =>
  __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_ADMOB_FORCE_TEST_IDS);

const describeError = (error: unknown): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const maybe = error as { code?: string | number; message?: string };
    return `${maybe.code ?? 'error'}: ${maybe.message ?? 'Unknown error'}`;
  }
  return String(error);
};

function getGoogleMobileAds(): any | null {
  if (cachedGoogleMobileAds !== undefined) return cachedGoogleMobileAds;
  try {
    // Load only banner-specific modules; avoid package root eager imports.
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
    if (__DEV__) {
      console.log('Google Mobile Ads banner module unavailable:', error);
    }
    cachedGoogleMobileAds = null;
  }
  return cachedGoogleMobileAds;
}

const AdBanner: React.FC<AdBannerProps> = ({ size, unitId }) => {
  const defaultBannerUnitId =
    process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID ||
    'ca-app-pub-9670547831022880/8900297100';
  const productionBannerUnitId = unitId || defaultBannerUnitId;
  const isUsingTestUnit = shouldForceTestAdUnits();

  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [didLoad, setDidLoad] = React.useState(false);
  const [hasRetriedWithDefault, setHasRetriedWithDefault] = React.useState(false);
  const [effectiveProductionUnitId, setEffectiveProductionUnitId] = React.useState(productionBannerUnitId);

  React.useEffect(() => {
    setEffectiveProductionUnitId(productionBannerUnitId);
    setHasRetriedWithDefault(false);
  }, [productionBannerUnitId]);

  if (!AdService.shouldShowAds()) {
    if (isAdDebugOverlayEnabled()) {
      const state = AdService.getAdsDebugState();
      return (
        <View style={styles.debugBox}>
          <Text style={styles.debugText}>Ads hidden: {state.shouldShowReason}</Text>
        </View>
      );
    }
    return null;
  }

  const debugState = AdService.getAdsDebugState();
  const googleMobileAds = getGoogleMobileAds();
  const BannerAd = googleMobileAds?.BannerAd;
  const BannerAdSize = googleMobileAds?.BannerAdSize;
  const TestIds = googleMobileAds?.TestIds;
  if (!BannerAd || !BannerAdSize || !TestIds) {
    if (isAdDebugOverlayEnabled()) {
      return (
        <View style={styles.debugBox}>
          <Text style={styles.debugText}>
            Banner unavailable: module={String(debugState.moduleAvailable)} init={String(debugState.initialized)}
          </Text>
          {debugState.lastInitError ? (
            <Text style={styles.debugSubText}>{debugState.lastInitError}</Text>
          ) : null}
        </View>
      );
    }
    return null;
  }

  const resolvedSize = (() => {
    if (!size) return BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
    if (typeof size === 'string' && BannerAdSize?.[size]) {
      return BannerAdSize[size];
    }
    return size;
  })();
  // Use test ID in dev or when explicitly forced for TestFlight/debug diagnosis.
  const adUnitId = isUsingTestUnit ? TestIds.BANNER : effectiveProductionUnitId;

  const minHeight = (() => {
    if (typeof size === 'string') {
      if (size === 'MEDIUM_RECTANGLE') return 250;
      if (size === 'LARGE_BANNER') return 100;
      if (size === 'FULL_BANNER') return 60;
    }
    return 52;
  })();

  return (
    <View style={[styles.container, { minHeight }]}>
      <BannerAd
        unitId={adUnitId}
        size={resolvedSize}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          setDidLoad(true);
          setLoadError(null);
          if (isAdDebugEnabled()) {
            console.log('[ADS] banner loaded', { platform: Platform.OS, adUnitId });
          }
        }}
        onAdFailedToLoad={(error: unknown) => {
          const reason = describeError(error);
          setDidLoad(false);
          setLoadError(reason);
          if (
            !isUsingTestUnit &&
            !hasRetriedWithDefault &&
            effectiveProductionUnitId !== defaultBannerUnitId
          ) {
            setHasRetriedWithDefault(true);
            setEffectiveProductionUnitId(defaultBannerUnitId);
            if (isAdDebugEnabled()) {
              console.warn(
                '[ADS] custom banner unit failed, retrying with default banner unit',
                reason
              );
            }
            return;
          }
          console.error('Ad failed to load: ', error);
        }}
      />
      {isAdDebugOverlayEnabled() && (
        <View style={styles.debugInline}>
          <Text style={styles.debugText}>
            {didLoad ? 'Banner loaded' : 'Banner pending'} • {Platform.OS} • {debugState.forceTestAdUnits ? 'test-id' : 'prod-id'}
          </Text>
          <Text style={styles.debugSubText}>
            unit: {adUnitId}
          </Text>
          {loadError ? <Text style={styles.debugSubText}>error: {loadError}</Text> : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 52,
    backgroundColor: 'transparent',
  },
  debugInline: {
    width: '100%',
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    backgroundColor: 'rgba(15,23,42,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  debugBox: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.45)',
    backgroundColor: 'rgba(36,12,24,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  debugText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  debugSubText: {
    color: '#CBD5E1',
    fontSize: 10,
    marginTop: 2,
  },
});

export default AdBanner;
