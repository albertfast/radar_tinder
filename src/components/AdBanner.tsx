import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Platform, Keyboard } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { AdService, getGoogleMobileAdsModule } from '../services/AdService';
import { ADMOB_PRODUCTION_UNITS } from '../config/admobUnits';

interface AdBannerProps {
  size?: any;
  unitId?: string;
  suppressAds?: boolean;
}

const isTruthyFlag = (value?: string) => value === '1' || value === 'true' || value === 'yes';
const isAdDebugEnabled = () => __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_AD_DEBUG);
const isAdDebugOverlayEnabled = () =>
  isAdDebugEnabled() && isTruthyFlag(process.env.EXPO_PUBLIC_AD_DEBUG_OVERLAY);
const shouldForceTestAdUnits = () =>
  __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_ADMOB_FORCE_TEST_IDS);
const shouldFallbackToTestOnFailure = () =>
  isTruthyFlag(process.env.EXPO_PUBLIC_ADMOB_FALLBACK_TO_TEST_ON_ERROR);

const describeError = (error: unknown): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const maybe = error as { code?: string | number; message?: string };
    return `${maybe.code ?? 'error'}: ${maybe.message ?? 'Unknown error'}`;
  }
  return String(error);
};

const AdBanner: React.FC<AdBannerProps> = ({ size, unitId, suppressAds = false }) => {
  let isFocused = true;
  try {
    isFocused = useIsFocused();
  } catch (e) {
    // If used outside navigation context, default to true
  }

  const platformBannerUnitId = Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS,
    android: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_ANDROID,
    default: undefined,
  });
  const fallbackTestBannerUnitId =
    Platform.OS === 'ios'
      ? 'ca-app-pub-3940256099942544/2934735716'
      : 'ca-app-pub-3940256099942544/6300978111';
  const productionBannerFallback =
    Platform.OS === 'ios'
      ? ADMOB_PRODUCTION_UNITS.ios.banner
      : ADMOB_PRODUCTION_UNITS.android.banner;
  const defaultBannerUnitId =
    platformBannerUnitId ||
    process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID ||
    productionBannerFallback;
  const productionBannerUnitId = unitId || defaultBannerUnitId;
  const isUsingTestUnit = shouldForceTestAdUnits();

  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [didLoad, setDidLoad] = React.useState(false);
  const [hasRetriedWithDefault, setHasRetriedWithDefault] = React.useState(false);
  const [hasRetriedWithTestUnit, setHasRetriedWithTestUnit] = React.useState(false);
  const [useTestFallbackUnit, setUseTestFallbackUnit] = React.useState(false);
  const [effectiveProductionUnitId, setEffectiveProductionUnitId] = React.useState(productionBannerUnitId);
  
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  React.useEffect(() => {
    setEffectiveProductionUnitId(productionBannerUnitId);
    setHasRetriedWithDefault(false);
    setHasRetriedWithTestUnit(false);
    setUseTestFallbackUnit(false);
  }, [productionBannerUnitId]);

  React.useEffect(() => {
    if (!isFocused || suppressAds) return;
    AdService.init().catch(() => {});
  }, [isFocused, suppressAds]);

  // LOGGING ADDED FOR DEBUGGING
  // console.log(`[AdBanner] isFocused: ${isFocused}, isKeyboardVisible: ${isKeyboardVisible}, unitId: ${unitId || 'default'}`);

  if (isKeyboardVisible || !isFocused) {
    return <View style={{ height: 0 }} />;
  }

  if (suppressAds) {
    if (isAdDebugOverlayEnabled()) {
      return (
        <View style={styles.debugBox}>
          <Text style={styles.debugText}>Ads suppressed during active navigation</Text>
        </View>
      );
    }
    return null;
  }

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
  const googleMobileAds = getGoogleMobileAdsModule();
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
    if (!size) return BannerAdSize.BANNER;
    if (typeof size === 'string' && BannerAdSize?.[size]) {
      return BannerAdSize[size];
    }
    return size;
  })();
  
  const adUnitId =
    isUsingTestUnit || useTestFallbackUnit ? TestIds.BANNER : effectiveProductionUnitId;

  const minHeight = (() => {
    if (typeof size === 'string') {
      if (size === 'MEDIUM_RECTANGLE') return 250;
      if (size === 'LARGE_BANNER') return 100;
      if (size === 'FULL_BANNER') return 60;
    }
    return 50;
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
            !useTestFallbackUnit &&
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
          if (
            !isUsingTestUnit &&
            !useTestFallbackUnit &&
            !hasRetriedWithTestUnit &&
            shouldFallbackToTestOnFailure()
          ) {
            setHasRetriedWithTestUnit(true);
            setUseTestFallbackUnit(true);
            if (isAdDebugEnabled()) {
              console.warn('[ADS] banner failed, retrying once with platform test unit', reason);
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
