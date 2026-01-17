import { NativeModules } from 'react-native';
import { useAuthStore } from '../store/authStore';

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

function getGoogleMobileAds(): GoogleMobileAdsExports | null {
  if (cachedGoogleMobileAds !== undefined) return cachedGoogleMobileAds;

  // Don't import the package root: it eagerly imports NativeAd modules and will
  // crash if RNGoogleMobileAdsNativeModule isn't present in the binary.
  const hasCoreModule = Boolean(NativeModules?.RNGoogleMobileAdsModule);
  if (!hasCoreModule) {
    cachedGoogleMobileAds = null;
    return cachedGoogleMobileAds;
  }

  try {
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
        if (__DEV__) {
          console.log('Mobile Ads SDK not available in this iOS/Android binary. Skipping ads initialization.');
        } else {
          console.warn(
            'Mobile Ads SDK not available in this iOS/Android binary. Skipping ads initialization.'
          );
        }
        return;
      }

      await mobileAds().initialize();
      await mobileAds().setRequestConfiguration({
        maxAdContentRating: googleMobileAds?.MaxAdContentRating?.G ?? 'G',
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      });
      this.isInitialized = true;
      console.log('Mobile Ads SDK initialized');
    } catch (error) {
      console.warn('Error initializing Mobile Ads SDK (Native module might be missing):', error);
    }
  }

  static shouldShowAds(): boolean {
    const user = useAuthStore.getState().user;
    if (!user) return true;
    
    // Hide ads for pro/premium users or if ads are explicitly removed
    return user.subscriptionType === 'free' && !user.adsRemoved;
  }

  static async loadInterstitial(): Promise<void> {
    if (!this.shouldShowAds()) return;

    const googleMobileAds = getGoogleMobileAds();
    if (!googleMobileAds?.InterstitialAd || !googleMobileAds?.TestIds) return;

    // Using Test ID for development
    const adUnitId = __DEV__ ? googleMobileAds.TestIds.INTERSTITIAL : 'ca-app-pub-3940256099942544/1033173712';
    
    this.interstitial = googleMobileAds.InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    return new Promise((resolve, reject) => {
      const unsubscribeLoaded = this.interstitial!.addAdEventListener(
        googleMobileAds?.AdEventType?.LOADED ?? 'loaded',
        () => {
        unsubscribeLoaded();
        resolve();
        }
      );

      const unsubscribeError = this.interstitial!.addAdEventListener(
        googleMobileAds?.AdEventType?.ERROR ?? 'error',
        (error: unknown) => {
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
