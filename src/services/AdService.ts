import { useAuthStore } from '../store/authStore';
import { Platform } from 'react-native';

type GoogleMobileAdsExports = {
  mobileAds: () => {
    initialize: () => Promise<unknown>;
    setRequestConfiguration: (config: unknown) => Promise<unknown>;
  };
  MaxAdContentRating?: any;
  TestIds?: any;
  AdEventType?: any;
  InterstitialAd?: any;
};

let cachedGoogleMobileAds: GoogleMobileAdsExports | null | undefined;
let cachedLastInitError: string | null = null;
let cachedLastInterstitialError: string | null = null;

const isTruthyFlag = (value?: string) => value === '1' || value === 'true' || value === 'yes';
const isAdDebugEnabled = () => __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_AD_DEBUG);
const shouldForceTestAdUnits = () =>
  __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_ADMOB_FORCE_TEST_IDS);

const parseTestDeviceIds = (): string[] => {
  const raw = process.env.EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const asErrorString = (error: unknown): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const maybe = error as { code?: string | number; message?: string };
    if (maybe.code || maybe.message) {
      return `${maybe.code ?? 'error'}: ${maybe.message ?? 'Unknown error'}`;
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

function getGoogleMobileAds(): GoogleMobileAdsExports | null {
  if (cachedGoogleMobileAds !== undefined) return cachedGoogleMobileAds;

  try {
    // Don't import the package root: it eagerly imports additional modules.
    // Load only what we need and rely on try/catch for binaries without ads.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const MobileAds = require('react-native-google-mobile-ads/lib/commonjs/MobileAds');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const MaxAdContentRating = require('react-native-google-mobile-ads/lib/commonjs/MaxAdContentRating');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TestIds = require('react-native-google-mobile-ads/lib/commonjs/TestIds');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdEventType = require('react-native-google-mobile-ads/lib/commonjs/AdEventType');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const InterstitialAd = require('react-native-google-mobile-ads/lib/commonjs/ads/InterstitialAd');

    const mobileAds = MobileAds?.default ?? MobileAds?.MobileAds;
    cachedGoogleMobileAds = {
      mobileAds,
      MaxAdContentRating: MaxAdContentRating?.MaxAdContentRating ?? MaxAdContentRating?.default,
      TestIds: TestIds?.TestIds ?? TestIds?.default,
      AdEventType: AdEventType?.AdEventType ?? AdEventType?.default,
      InterstitialAd: InterstitialAd?.InterstitialAd ?? InterstitialAd?.default,
    };
  } catch (error) {
    if (__DEV__) {
      console.log('Google Mobile Ads module unavailable, skipping ads:', error);
    }
    cachedLastInitError = `ads_module_unavailable: ${asErrorString(error)}`;
    cachedGoogleMobileAds = null;
  }

  return cachedGoogleMobileAds;
}

export class AdService {
  private static interstitial: any | null = null;
  private static isInitialized: boolean = false;
  private static hasAttemptedInit: boolean = false;

  static async init(): Promise<void> {
    if (this.hasAttemptedInit) return;
    this.hasAttemptedInit = true;
    
    try {
      const googleMobileAds = getGoogleMobileAds();
      const mobileAds = googleMobileAds?.mobileAds;

      // Check if the native module exists before initializing
      if (typeof mobileAds !== 'function') {
        cachedLastInitError = 'mobile_ads_function_missing';
        if (__DEV__) {
          console.log('Mobile Ads SDK not available in this iOS/Android binary. Skipping ads initialization.');
        } else {
          console.warn(
            'Mobile Ads SDK not available in this iOS/Android binary. Skipping ads initialization.'
          );
        }
        return;
      }

      const testDeviceIdentifiers = parseTestDeviceIds();
      await mobileAds().initialize();
      await mobileAds().setRequestConfiguration({
        maxAdContentRating: googleMobileAds?.MaxAdContentRating?.G ?? 'G',
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        ...(testDeviceIdentifiers.length > 0 ? { testDeviceIdentifiers } : {}),
      });
      this.isInitialized = true;
      cachedLastInitError = null;
      if (isAdDebugEnabled()) {
        console.log('[ADS] init ok', {
          platform: Platform.OS,
          forcedTestIds: shouldForceTestAdUnits(),
          testDeviceIds: testDeviceIdentifiers.length,
        });
      }
      console.log('Mobile Ads SDK initialized');
    } catch (error) {
      cachedLastInitError = asErrorString(error);
      console.warn('Error initializing Mobile Ads SDK (Native module might be missing):', error);
    }
  }

  static shouldShowAds(): boolean {
    const user = useAuthStore.getState().user;
    if (!user) return true;

    const subscription = user.subscriptionType ?? 'free';
    if (subscription !== 'free') return false;
    return !user.adsRemoved;
  }

  static getAdsDebugState(): {
    platform: string;
    moduleAvailable: boolean;
    initialized: boolean;
    shouldShowAds: boolean;
    shouldShowReason: string;
    forceTestAdUnits: boolean;
    testDeviceIdsCount: number;
    hasInterstitial: boolean;
    lastInitError: string | null;
    lastInterstitialError: string | null;
  } {
    const user = useAuthStore.getState().user;
    const moduleAvailable = Boolean(getGoogleMobileAds()?.mobileAds);
    const forceTestAdUnits = shouldForceTestAdUnits();
    const shouldShow = this.shouldShowAds();
    let shouldShowReason = 'free_user_ads_enabled';

    if (!user) shouldShowReason = 'guest_user';
    else if ((user.subscriptionType ?? 'free') !== 'free') shouldShowReason = 'subscription_ad_free';
    else if (user.adsRemoved) shouldShowReason = 'ads_removed';

    return {
      platform: Platform.OS,
      moduleAvailable,
      initialized: this.isInitialized,
      shouldShowAds: shouldShow,
      shouldShowReason,
      forceTestAdUnits,
      testDeviceIdsCount: parseTestDeviceIds().length,
      hasInterstitial: Boolean(this.interstitial),
      lastInitError: cachedLastInitError,
      lastInterstitialError: cachedLastInterstitialError,
    };
  }

  static async loadInterstitial(): Promise<void> {
    if (!this.shouldShowAds()) return;

    const googleMobileAds = getGoogleMobileAds();
    if (!googleMobileAds?.InterstitialAd || !googleMobileAds?.TestIds) return;

    // Use test ID in dev or when explicitly forced for TestFlight/debug diagnosis.
    const productionInterstitialId =
      process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID ||
      'ca-app-pub-3940256099942544/1033173712';
    const adUnitId = shouldForceTestAdUnits()
      ? googleMobileAds.TestIds.INTERSTITIAL
      : productionInterstitialId;
    if (isAdDebugEnabled()) {
      console.log('[ADS] interstitial load requested', {
        adUnitId,
        forceTest: shouldForceTestAdUnits(),
      });
    }
    
    this.interstitial = googleMobileAds.InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    return new Promise((resolve, reject) => {
      const unsubscribeLoaded = this.interstitial!.addAdEventListener(
        googleMobileAds?.AdEventType?.LOADED ?? 'loaded',
        () => {
        cachedLastInterstitialError = null;
        unsubscribeLoaded();
        resolve();
        }
      );

      const unsubscribeError = this.interstitial!.addAdEventListener(
        googleMobileAds?.AdEventType?.ERROR ?? 'error',
        (error: unknown) => {
        cachedLastInterstitialError = asErrorString(error);
        if (isAdDebugEnabled()) {
          console.log('[ADS] interstitial load failed', cachedLastInterstitialError);
        }
        unsubscribeError();
        reject(error);
        }
      );

      this.interstitial!.load();
    });
  }

  static async showInterstitial(): Promise<void> {
    if (!this.shouldShowAds() || !this.interstitial) return;

    try {
      if (this.interstitial.loaded) {
        await this.interstitial.show();
        // Load the next one
        this.loadInterstitial().catch(() => {});
      } else {
        await this.loadInterstitial();
        await this.interstitial.show();
      }
    } catch (error) {
      console.error('Error showing interstitial ad:', error);
    }
  }
}
