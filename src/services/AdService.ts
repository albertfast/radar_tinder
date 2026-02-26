import { useAuthStore } from '../store/authStore';
import { Platform } from 'react-native';
import { isAdminUser, shouldShowHomeAds } from '../utils/access';

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
    .map((item: string) => item.trim())
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

const loadGoogleMobileAdsModules = () => {
  let root: any = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    root = require('react-native-google-mobile-ads');
  } catch {}

  return { root };
};

function getGoogleMobileAds(): GoogleMobileAdsExports | null {
  if (cachedGoogleMobileAds !== undefined) return cachedGoogleMobileAds;

  try {
    const { root } = loadGoogleMobileAdsModules();

    const mobileAds =
      root?.default ??
      root?.mobileAds ??
      root?.MobileAds;
    cachedGoogleMobileAds = {
      mobileAds,
      MaxAdContentRating: root?.MaxAdContentRating,
      TestIds: root?.TestIds,
      AdEventType: root?.AdEventType,
      InterstitialAd: root?.InterstitialAd,
    };

    if (typeof cachedGoogleMobileAds.mobileAds !== 'function') {
      throw new Error('mobile_ads_function_missing');
    }
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
  private static initPromise: Promise<void> | null = null;
  private static navigationAdsSuppressed: boolean = false;

  static async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    if (this.hasAttemptedInit && !cachedLastInitError) return;
    this.hasAttemptedInit = true;

    this.initPromise = (async () => {
      try {
        const googleMobileAds = getGoogleMobileAds();
        const mobileAds = googleMobileAds?.mobileAds;

        if (typeof mobileAds !== 'function') {
          this.isInitialized = false;
          cachedLastInitError = 'mobile_ads_function_missing';
          if (__DEV__) {
            console.log(
              'Mobile Ads SDK not available in this iOS/Android binary. Skipping ads initialization.'
            );
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
        this.isInitialized = false;
        cachedLastInitError = asErrorString(error);
        console.warn('Error initializing Mobile Ads SDK (Native module might be missing):', error);
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  static shouldShowAds(): boolean {
    if (this.navigationAdsSuppressed) return false;

    const user = useAuthStore.getState().user;
    if (!user) return true;
    return shouldShowHomeAds(user);
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
    navigationAdsSuppressed: boolean;
    lastInitError: string | null;
    lastInterstitialError: string | null;
  } {
    const user = useAuthStore.getState().user;
    const moduleAvailable = Boolean(getGoogleMobileAds()?.mobileAds);
    const forceTestAdUnits = shouldForceTestAdUnits();
    const shouldShow = this.shouldShowAds();
    let shouldShowReason = 'free_user_ads_enabled';

    if (this.navigationAdsSuppressed) shouldShowReason = 'navigation_suppressed';
    else if (!user) shouldShowReason = 'guest_user';
    else if (isAdminUser(user)) shouldShowReason = 'admin_override';
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
      navigationAdsSuppressed: this.navigationAdsSuppressed,
      lastInitError: cachedLastInitError,
      lastInterstitialError: cachedLastInterstitialError,
    };
  }

  static setNavigationAdsSuppressed(suppressed: boolean): void {
    this.navigationAdsSuppressed = suppressed;
  }

  static async loadInterstitial(): Promise<void> {
    if (!this.shouldShowAds()) return;
    await this.init();
    if (!this.isInitialized) return;

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
