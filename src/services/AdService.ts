import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { isAdminUser, shouldShowHomeAds } from '../utils/access';
import { AnalyticsService } from './AnalyticsService';

export type AdPlacement =
  | 'onboarding_location_granted'
  | 'app_foreground'
  | 'navigate_route'
  | 'start_driving_basic'
  | 'end_ride'
  | 'open_settings'
  | 'open_leaderboard';

export type AdShowResult =
  | 'shown'
  | 'skipped_not_eligible'
  | 'skipped_cooldown'
  | 'skipped_session_cap'
  | 'skipped_not_loaded'
  | 'failed';

type AdSkipResult = Exclude<AdShowResult, 'shown' | 'failed'>;

type GoogleMobileAdsExports = {
  mobileAds: () => {
    initialize: () => Promise<unknown>;
    setRequestConfiguration: (config: unknown) => Promise<unknown>;
  };
  MaxAdContentRating?: any;
  BannerAd?: any;
  BannerAdSize?: any;
  TestIds?: any;
  AdEventType?: any;
  InterstitialAd?: any;
  AppOpenAd?: any;
};

type InterstitialPoolKey = 'general' | 'start_driving';

type FullscreenSlotState = {
  ad: any | null;
  isLoading: boolean;
  loadedAt: number;
  loadPromise: Promise<boolean> | null;
  adUnitId: string | null;
};

const GMA_GLOBAL_CACHE_KEY = '__RT_GMA_EXPORTS__';
let cachedGoogleMobileAds: GoogleMobileAdsExports | null | undefined;
let cachedLastInitError: string | null = null;
let cachedLastInterstitialError: string | null = null;
let cachedLastAppOpenError: string | null = null;

const INTERSTITIAL_COOLDOWN_MS = 120 * 1000;
const INTERSTITIAL_SESSION_MAX = 4;
const SETTINGS_LEADERBOARD_PROBABILITY = 0.3;
const NAV_PLACEMENT_COOLDOWN_MS = 5 * 60 * 1000;
const APP_OPEN_COOLDOWN_MS = 5 * 60 * 1000;
const INTERSTITIAL_EXPIRY_MS = 60 * 60 * 1000;
const APP_OPEN_EXPIRY_MS = 4 * 60 * 60 * 1000;

const isTruthyFlag = (value?: string) => value === '1' || value === 'true' || value === 'yes';
const isAdDebugEnabled = () => __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_AD_DEBUG);
const shouldForceTestAdUnits = () =>
  __DEV__ || isTruthyFlag(process.env.EXPO_PUBLIC_ADMOB_FORCE_TEST_IDS);

const getEnvValue = (key: string): string | undefined => {
  const env = process.env as Record<string, string | undefined>;
  return env[key];
};

const resolvePlatformEnv = (androidKey: string, iosKey: string): string | undefined => {
  if (Platform.OS === 'android') return getEnvValue(androidKey);
  if (Platform.OS === 'ios') return getEnvValue(iosKey);
  return undefined;
};

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
  return root;
};

export function getGoogleMobileAdsModule(): GoogleMobileAdsExports | null {
  if (cachedGoogleMobileAds !== undefined) return cachedGoogleMobileAds;

  try {
    const globalCache = globalThis as unknown as Record<string, unknown>;
    const cachedFromGlobal = globalCache[GMA_GLOBAL_CACHE_KEY] as
      | GoogleMobileAdsExports
      | null
      | undefined;
    if (cachedFromGlobal !== undefined) {
      cachedGoogleMobileAds = cachedFromGlobal;
      return cachedGoogleMobileAds;
    }

    const root = loadGoogleMobileAdsModules();
    const mobileAds =
      (typeof root?.mobileAds === 'function'
        ? root.mobileAds
        : typeof root?.default?.mobileAds === 'function'
          ? root.default.mobileAds
          : typeof root?.default === 'function'
            ? root.default
            : typeof root?.MobileAds === 'function'
              ? root.MobileAds
              : null);

    cachedGoogleMobileAds = {
      mobileAds,
      MaxAdContentRating: root?.MaxAdContentRating ?? root?.default?.MaxAdContentRating,
      BannerAd: root?.BannerAd ?? root?.default?.BannerAd,
      BannerAdSize: root?.BannerAdSize ?? root?.default?.BannerAdSize,
      TestIds: root?.TestIds ?? root?.default?.TestIds,
      AdEventType: root?.AdEventType ?? root?.default?.AdEventType,
      InterstitialAd: root?.InterstitialAd ?? root?.default?.InterstitialAd,
      AppOpenAd: root?.AppOpenAd ?? root?.default?.AppOpenAd,
    };

    globalCache[GMA_GLOBAL_CACHE_KEY] = cachedGoogleMobileAds;
    if (typeof cachedGoogleMobileAds.mobileAds !== 'function') {
      throw new Error('mobile_ads_function_missing');
    }
  } catch (error) {
    cachedLastInitError = `ads_module_unavailable: ${asErrorString(error)}`;
    cachedGoogleMobileAds = null;
    const globalCache = globalThis as unknown as Record<string, unknown>;
    globalCache[GMA_GLOBAL_CACHE_KEY] = null;
  }

  return cachedGoogleMobileAds;
}

const createSlotState = (): FullscreenSlotState => ({
  ad: null,
  isLoading: false,
  loadedAt: 0,
  loadPromise: null,
  adUnitId: null,
});

export class AdService {
  private static isInitialized = false;
  private static hasAttemptedInit = false;
  private static initPromise: Promise<void> | null = null;

  private static navigationAdsSuppressed = false;
  private static drivingState = { isDriving: false, hasActiveRoute: false };

  private static interstitials: Record<InterstitialPoolKey, FullscreenSlotState> = {
    general: createSlotState(),
    start_driving: createSlotState(),
  };
  private static appOpen: FullscreenSlotState = createSlotState();

  private static interstitialShownThisSession = 0;
  private static lastInterstitialShownAt = 0;
  private static lastAppOpenShownAt = 0;
  private static lastPlacementShownAt: Partial<Record<AdPlacement, number>> = {};
  private static hasShownOnboardingAppOpen = false;

  private static resetSlot(slot: FullscreenSlotState) {
    slot.ad = null;
    slot.isLoading = false;
    slot.loadedAt = 0;
    slot.loadPromise = null;
    slot.adUnitId = null;
  }

  private static async trackAdEvent(
    eventName: 'ad_shown' | 'ad_skipped_reason' | 'ad_load_failed',
    payload: Record<string, any>
  ): Promise<void> {
    await AnalyticsService.trackEvent(eventName, payload).catch(() => {});
  }

  private static getInterstitialAdUnitId(key: InterstitialPoolKey): string {
    const googleMobileAds = getGoogleMobileAdsModule();
    const defaultTestId =
      googleMobileAds?.TestIds?.INTERSTITIAL || 'ca-app-pub-3940256099942544/1033173712';
    if (shouldForceTestAdUnits()) return defaultTestId;

    if (key === 'start_driving') {
      return (
        resolvePlatformEnv(
          'EXPO_PUBLIC_ADMOB_INTERSTITIAL_START_DRIVING_UNIT_ID_ANDROID',
          'EXPO_PUBLIC_ADMOB_INTERSTITIAL_START_DRIVING_UNIT_ID_IOS'
        ) || defaultTestId
      );
    }

    return (
      resolvePlatformEnv(
        'EXPO_PUBLIC_ADMOB_INTERSTITIAL_GENERAL_UNIT_ID_ANDROID',
        'EXPO_PUBLIC_ADMOB_INTERSTITIAL_GENERAL_UNIT_ID_IOS'
      ) || defaultTestId
    );
  }

  private static getAppOpenAdUnitId(): string {
    const googleMobileAds = getGoogleMobileAdsModule();
    const defaultTestId =
      googleMobileAds?.TestIds?.APP_OPEN || 'ca-app-pub-3940256099942544/9257395921';
    if (shouldForceTestAdUnits()) return defaultTestId;

    return (
      resolvePlatformEnv(
        'EXPO_PUBLIC_ADMOB_APP_OPEN_UNIT_ID_ANDROID',
        'EXPO_PUBLIC_ADMOB_APP_OPEN_UNIT_ID_IOS'
      ) || defaultTestId
    );
  }

  private static isInterstitialExpired(loadedAt: number): boolean {
    return !loadedAt || Date.now() - loadedAt >= INTERSTITIAL_EXPIRY_MS;
  }

  private static isAppOpenExpired(loadedAt: number): boolean {
    return !loadedAt || Date.now() - loadedAt >= APP_OPEN_EXPIRY_MS;
  }

  private static isInterstitialReady(key: InterstitialPoolKey): boolean {
    const slot = this.interstitials[key];
    if (!slot.ad || !slot.ad.loaded) return false;
    if (this.isInterstitialExpired(slot.loadedAt)) {
      this.resetSlot(slot);
      return false;
    }
    return true;
  }

  private static isAppOpenReady(): boolean {
    if (!this.appOpen.ad || !this.appOpen.ad.loaded) return false;
    if (this.isAppOpenExpired(this.appOpen.loadedAt)) {
      this.resetSlot(this.appOpen);
      return false;
    }
    return true;
  }

  private static interstitialPoolForPlacement(placement: AdPlacement): InterstitialPoolKey {
    return placement === 'start_driving_basic' ? 'start_driving' : 'general';
  }

  private static async preloadInterstitial(key: InterstitialPoolKey): Promise<boolean> {
    await this.init();
    if (!this.isInitialized) return false;

    const googleMobileAds = getGoogleMobileAdsModule();
    if (!googleMobileAds?.InterstitialAd) return false;

    const slot = this.interstitials[key];
    const adUnitId = this.getInterstitialAdUnitId(key);

    if (slot.ad && slot.adUnitId === adUnitId && this.isInterstitialReady(key)) {
      return true;
    }

    if (slot.isLoading && slot.loadPromise) {
      return slot.loadPromise;
    }

    if (slot.adUnitId !== adUnitId) {
      this.resetSlot(slot);
    }

    const ad = googleMobileAds.InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    slot.ad = ad;
    slot.adUnitId = adUnitId;
    slot.isLoading = true;
    slot.loadedAt = 0;

    const loadPromise = new Promise<boolean>((resolve) => {
      const loadedType = googleMobileAds?.AdEventType?.LOADED ?? 'loaded';
      const errorType = googleMobileAds?.AdEventType?.ERROR ?? 'error';

      const unsubscribeLoaded = ad.addAdEventListener(loadedType, () => {
        slot.isLoading = false;
        slot.loadedAt = Date.now();
        slot.loadPromise = null;
        unsubscribeLoaded();
        unsubscribeError();
        resolve(true);
      });

      const unsubscribeError = ad.addAdEventListener(errorType, (error: unknown) => {
        cachedLastInterstitialError = asErrorString(error);
        slot.isLoading = false;
        slot.loadPromise = null;
        this.resetSlot(slot);
        unsubscribeLoaded();
        unsubscribeError();
        this.trackAdEvent('ad_load_failed', {
          format: 'interstitial',
          pool: key,
          ad_unit_id: adUnitId,
          error: cachedLastInterstitialError,
        }).catch(() => {});
        resolve(false);
      });

      ad.load();
    });

    slot.loadPromise = loadPromise;
    return loadPromise;
  }

  private static async preloadAppOpen(): Promise<boolean> {
    await this.init();
    if (!this.isInitialized) return false;

    const googleMobileAds = getGoogleMobileAdsModule();
    if (!googleMobileAds?.AppOpenAd) return false;

    const slot = this.appOpen;
    const adUnitId = this.getAppOpenAdUnitId();

    if (slot.ad && slot.adUnitId === adUnitId && this.isAppOpenReady()) {
      return true;
    }

    if (slot.isLoading && slot.loadPromise) {
      return slot.loadPromise;
    }

    if (slot.adUnitId !== adUnitId) {
      this.resetSlot(slot);
    }

    const ad = googleMobileAds.AppOpenAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    slot.ad = ad;
    slot.adUnitId = adUnitId;
    slot.isLoading = true;
    slot.loadedAt = 0;

    const loadPromise = new Promise<boolean>((resolve) => {
      const loadedType = googleMobileAds?.AdEventType?.LOADED ?? 'loaded';
      const errorType = googleMobileAds?.AdEventType?.ERROR ?? 'error';

      const unsubscribeLoaded = ad.addAdEventListener(loadedType, () => {
        slot.isLoading = false;
        slot.loadedAt = Date.now();
        slot.loadPromise = null;
        unsubscribeLoaded();
        unsubscribeError();
        resolve(true);
      });

      const unsubscribeError = ad.addAdEventListener(errorType, (error: unknown) => {
        cachedLastAppOpenError = asErrorString(error);
        slot.isLoading = false;
        slot.loadPromise = null;
        this.resetSlot(slot);
        unsubscribeLoaded();
        unsubscribeError();
        this.trackAdEvent('ad_load_failed', {
          format: 'app_open',
          ad_unit_id: adUnitId,
          error: cachedLastAppOpenError,
        }).catch(() => {});
        resolve(false);
      });

      ad.load();
    });

    slot.loadPromise = loadPromise;
    return loadPromise;
  }

  static async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    if (this.hasAttemptedInit && !cachedLastInitError) return;
    this.hasAttemptedInit = true;

    this.initPromise = (async () => {
      try {
        const googleMobileAds = getGoogleMobileAdsModule();
        const mobileAds = googleMobileAds?.mobileAds;

        if (typeof mobileAds !== 'function') {
          this.isInitialized = false;
          cachedLastInitError = 'mobile_ads_function_missing';
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
      } catch (error) {
        this.isInitialized = false;
        cachedLastInitError = asErrorString(error);
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  static shouldShowAds(): boolean {
    if (this.navigationAdsSuppressed) return false;
    if (this.drivingState.isDriving || this.drivingState.hasActiveRoute) return false;

    const user = useAuthStore.getState().user;
    if (!user) return true;
    return shouldShowHomeAds(user);
  }

  static markDrivingState(isDriving: boolean, hasActiveRoute: boolean): void {
    this.drivingState = { isDriving, hasActiveRoute };
    this.navigationAdsSuppressed = hasActiveRoute;
  }

  static setNavigationAdsSuppressed(suppressed: boolean): void {
    this.navigationAdsSuppressed = suppressed;
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
    hasAppOpen: boolean;
    interstitialShownThisSession: number;
    navigationAdsSuppressed: boolean;
    drivingState: { isDriving: boolean; hasActiveRoute: boolean };
    lastInitError: string | null;
    lastInterstitialError: string | null;
    lastAppOpenError: string | null;
  } {
    const user = useAuthStore.getState().user;
    const moduleAvailable = Boolean(getGoogleMobileAdsModule()?.mobileAds);
    const shouldShow = this.shouldShowAds();
    let shouldShowReason = 'free_user_ads_enabled';

    if (this.navigationAdsSuppressed) shouldShowReason = 'navigation_suppressed';
    else if (this.drivingState.isDriving || this.drivingState.hasActiveRoute) shouldShowReason = 'driving_active';
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
      forceTestAdUnits: shouldForceTestAdUnits(),
      testDeviceIdsCount: parseTestDeviceIds().length,
      hasInterstitial:
        this.isInterstitialReady('general') || this.isInterstitialReady('start_driving'),
      hasAppOpen: this.isAppOpenReady(),
      interstitialShownThisSession: this.interstitialShownThisSession,
      navigationAdsSuppressed: this.navigationAdsSuppressed,
      drivingState: this.drivingState,
      lastInitError: cachedLastInitError,
      lastInterstitialError: cachedLastInterstitialError,
      lastAppOpenError: cachedLastAppOpenError,
    };
  }

  static async preloadAll(): Promise<void> {
    await this.init();
    if (!this.isInitialized) return;
    if (!this.shouldShowAds()) return;

    await Promise.allSettled([
      this.preloadAppOpen(),
      this.preloadInterstitial('general'),
      this.preloadInterstitial('start_driving'),
    ]);
  }

  private static skipResult(
    format: 'interstitial' | 'app_open',
    placement: AdPlacement,
    result: AdSkipResult
  ): AdShowResult {
    this.trackAdEvent('ad_skipped_reason', {
      format,
      placement,
      reason: result,
      session_interstitial_count: this.interstitialShownThisSession,
    }).catch(() => {});
    return result;
  }

  private static checkInterstitialEligibility(placement: AdPlacement): AdSkipResult | null {
    if (!this.shouldShowAds()) return 'skipped_not_eligible';

    if (this.interstitialShownThisSession >= INTERSTITIAL_SESSION_MAX) {
      return 'skipped_session_cap';
    }

    const now = Date.now();
    if (now - this.lastInterstitialShownAt < INTERSTITIAL_COOLDOWN_MS) {
      return 'skipped_cooldown';
    }

    if (placement === 'open_settings' || placement === 'open_leaderboard') {
      const lastPlacementAt = this.lastPlacementShownAt[placement] || 0;
      if (now - lastPlacementAt < NAV_PLACEMENT_COOLDOWN_MS) {
        return 'skipped_cooldown';
      }
      if (Math.random() > SETTINGS_LEADERBOARD_PROBABILITY) {
        return 'skipped_not_eligible';
      }
    }

    return null;
  }

  static async showInterstitial(placement: AdPlacement): Promise<AdShowResult> {
    await this.init();
    if (!this.isInitialized) {
      return this.skipResult('interstitial', placement, 'skipped_not_loaded');
    }

    const eligibility = this.checkInterstitialEligibility(placement);
    if (eligibility) return this.skipResult('interstitial', placement, eligibility);

    const poolKey = this.interstitialPoolForPlacement(placement);
    if (!this.isInterstitialReady(poolKey)) {
      this.preloadInterstitial(poolKey).catch(() => {});
      return this.skipResult('interstitial', placement, 'skipped_not_loaded');
    }

    const slot = this.interstitials[poolKey];
    try {
      await slot.ad.show();
      this.interstitialShownThisSession += 1;
      this.lastInterstitialShownAt = Date.now();
      this.lastPlacementShownAt[placement] = this.lastInterstitialShownAt;

      this.trackAdEvent('ad_shown', {
        format: 'interstitial',
        placement,
        pool: poolKey,
        ad_unit_id: slot.adUnitId || 'unknown',
        session_interstitial_count: this.interstitialShownThisSession,
      }).catch(() => {});

      this.resetSlot(slot);
      this.preloadInterstitial(poolKey).catch(() => {});
      return 'shown';
    } catch (error) {
      cachedLastInterstitialError = asErrorString(error);
      this.trackAdEvent('ad_load_failed', {
        format: 'interstitial',
        placement,
        pool: poolKey,
        ad_unit_id: slot.adUnitId || 'unknown',
        error: cachedLastInterstitialError,
      }).catch(() => {});
      this.resetSlot(slot);
      this.preloadInterstitial(poolKey).catch(() => {});
      return 'failed';
    }
  }

  private static checkAppOpenEligibility(placement: AdPlacement): AdSkipResult | null {
    if (!this.shouldShowAds()) return 'skipped_not_eligible';

    const now = Date.now();
    if (placement === 'onboarding_location_granted' && this.hasShownOnboardingAppOpen) {
      return 'skipped_not_eligible';
    }
    if (placement === 'app_foreground' && now - this.lastAppOpenShownAt < APP_OPEN_COOLDOWN_MS) {
      return 'skipped_cooldown';
    }
    return null;
  }

  static async showAppOpen(placement: AdPlacement): Promise<AdShowResult> {
    await this.init();
    if (!this.isInitialized) {
      return this.skipResult('app_open', placement, 'skipped_not_loaded');
    }

    const eligibility = this.checkAppOpenEligibility(placement);
    if (eligibility) return this.skipResult('app_open', placement, eligibility);

    if (!this.isAppOpenReady()) {
      this.preloadAppOpen().catch(() => {});
      return this.skipResult('app_open', placement, 'skipped_not_loaded');
    }

    try {
      await this.appOpen.ad.show();
      const shownAt = Date.now();
      this.lastAppOpenShownAt = shownAt;
      this.lastPlacementShownAt[placement] = shownAt;
      if (placement === 'onboarding_location_granted') {
        this.hasShownOnboardingAppOpen = true;
      }

      this.trackAdEvent('ad_shown', {
        format: 'app_open',
        placement,
        ad_unit_id: this.appOpen.adUnitId || 'unknown',
      }).catch(() => {});

      this.resetSlot(this.appOpen);
      this.preloadAppOpen().catch(() => {});
      return 'shown';
    } catch (error) {
      cachedLastAppOpenError = asErrorString(error);
      this.trackAdEvent('ad_load_failed', {
        format: 'app_open',
        placement,
        ad_unit_id: this.appOpen.adUnitId || 'unknown',
        error: cachedLastAppOpenError,
      }).catch(() => {});
      this.resetSlot(this.appOpen);
      this.preloadAppOpen().catch(() => {});
      return 'failed';
    }
  }

  static async trackNavigationEntry(screenName: string): Promise<AdShowResult> {
    const normalized = (screenName || '').trim().toLowerCase();
    if (normalized.includes('leader')) {
      return this.showInterstitial('open_leaderboard');
    }
    if (normalized.includes('setting')) {
      return this.showInterstitial('open_settings');
    }
    return 'skipped_not_eligible';
  }
}
