import { NativeModules, Platform } from 'react-native';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { useAuthStore } from '../store/authStore';
import { AnalyticsService } from './AnalyticsService';
import { SupabaseService } from './SupabaseService';
import { readBooleanFlag, readNumberFlag } from '../utils/flags';

// Public SDK keys for RevenueCat (safe to ship in client apps)
const REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
}) || '';

const RC_ENTITLEMENT_PRO = (process.env.EXPO_PUBLIC_RC_ENTITLEMENT_PRO || 'pro').trim();
const RC_ENTITLEMENT_REMOVE_ADS = (
  process.env.EXPO_PUBLIC_RC_ENTITLEMENT_REMOVE_ADS || 'remove_ads'
).trim();
const SUBS_SYNC_V2_ENABLED = readBooleanFlag('EXPO_PUBLIC_SUBS_SYNC_V2', true);
const ACCOUNT_LINK_GRACE_HOURS = Math.max(
  1,
  readNumberFlag('EXPO_PUBLIC_ACCOUNT_LINK_GRACE_HOURS', 24)
);

type PurchasesBindings = {
  Purchases: any;
  LOG_LEVEL: any;
};

type PurchasesUIBindings = {
  RevenueCatUI: any;
  PAYWALL_RESULT: any;
};

export type PaywallPresentationStatus =
  | 'purchased'
  | 'restored'
  | 'cancelled'
  | 'error'
  | 'not_presented'
  | 'unavailable';

let cachedPurchasesBindings: PurchasesBindings | null | undefined;
let cachedPurchasesUIBindings: PurchasesUIBindings | null | undefined;

const getPurchasesBindings = (): PurchasesBindings | null => {
  if (cachedPurchasesBindings !== undefined) return cachedPurchasesBindings;

  if (!NativeModules?.RNPurchases) {
    cachedPurchasesBindings = null;
    return cachedPurchasesBindings;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const purchasesModule = require('react-native-purchases');
    cachedPurchasesBindings = {
      Purchases: purchasesModule?.default ?? purchasesModule,
      LOG_LEVEL: purchasesModule?.LOG_LEVEL,
    };
  } catch {
    cachedPurchasesBindings = null;
  }

  return cachedPurchasesBindings;
};

const getPurchasesUIBindings = (): PurchasesUIBindings | null => {
  if (cachedPurchasesUIBindings !== undefined) return cachedPurchasesUIBindings;

  if (!NativeModules?.RNPurchases) {
    cachedPurchasesUIBindings = null;
    return cachedPurchasesUIBindings;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const purchasesUIModule = require('react-native-purchases-ui');
    cachedPurchasesUIBindings = {
      RevenueCatUI: purchasesUIModule?.default ?? purchasesUIModule,
      PAYWALL_RESULT: purchasesUIModule?.PAYWALL_RESULT ?? {},
    };
  } catch {
    cachedPurchasesUIBindings = null;
  }

  return cachedPurchasesUIBindings;
};

const parseOptionalDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const toIsoOrNull = (value?: Date): string | null => {
  if (!value) return null;
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
};

export class SubscriptionService {
  private static isInitialized = false;
  private static loggedMissingConfig = false;
  private static customerInfoListenerAttached = false;
  private static lastCustomerInfoSignature = '';

  private static hasValidConfig(): boolean {
    return Boolean(REVENUECAT_API_KEY) && !REVENUECAT_API_KEY.includes('placeholder');
  }

  private static hasEntitlement(customerInfo: CustomerInfo, entitlementId: string): boolean {
    if (!entitlementId) return false;
    return Boolean((customerInfo as any)?.entitlements?.active?.[entitlementId]);
  }

  private static getSubscriptionExpiration(customerInfo: CustomerInfo): Date | undefined {
    const proEntitlement: any = (customerInfo as any)?.entitlements?.active?.[RC_ENTITLEMENT_PRO];
    const entitlementExpiry = parseOptionalDate(proEntitlement?.expirationDate);
    const customerExpiry = parseOptionalDate((customerInfo as any)?.latestExpirationDate);
    return entitlementExpiry || customerExpiry;
  }

  private static buildCustomerInfoSignature(customerInfo: CustomerInfo): string {
    const active = Object.keys((customerInfo as any)?.entitlements?.active || {}).sort().join(',');
    const expiry = String((customerInfo as any)?.latestExpirationDate || '');
    const originalAppUserId = String((customerInfo as any)?.originalAppUserId || '');
    return `${originalAppUserId}|${active}|${expiry}`;
  }

  private static async persistSubscriptionSnapshot(params: {
    subscriptionType: 'free' | 'premium' | 'pro';
    adsRemoved: boolean;
    subscriptionExpiresAt?: Date;
    rcCustomerId?: string;
    accountLinkRequiredUntil?: Date;
  }) {
    const user = useAuthStore.getState().user;
    if (!SUBS_SYNC_V2_ENABLED || !user?.id) return;

    await SupabaseService.upsertSubscriptionSnapshot(user.id, {
      subscriptionType: params.subscriptionType,
      adsRemoved: params.adsRemoved,
      subscriptionExpiresAt: toIsoOrNull(params.subscriptionExpiresAt),
      rcCustomerId: params.rcCustomerId || null,
      accountLinkRequiredUntil: toIsoOrNull(params.accountLinkRequiredUntil),
    });
  }

  static async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) {
        this.isInitialized = true;
        if (__DEV__) {
          console.warn('RevenueCat native module is unavailable. Subscription features are disabled.');
        }
        return;
      }

      if (__DEV__ && bindings.LOG_LEVEL?.DEBUG) {
        bindings.Purchases.setLogLevel(bindings.LOG_LEVEL.DEBUG);
      }

      if (!this.hasValidConfig()) {
        this.isInitialized = true;
        if (!this.loggedMissingConfig) {
          this.loggedMissingConfig = true;
          console.warn(
            'RevenueCat is not configured. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY and EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY.'
          );
        }
        return;
      }

      const user = useAuthStore.getState().user;
      bindings.Purchases.configure({
        apiKey: REVENUECAT_API_KEY,
        ...(user?.id ? { appUserID: user.id } : {}),
      });

      if (user?.id) {
        const loginResult = await bindings.Purchases.logIn(user.id);
        if (loginResult?.customerInfo) {
          await this.updateUserSubscriptionStatus(loginResult.customerInfo, 'init_login');
        }
      } else {
        const customerInfo = await bindings.Purchases.getCustomerInfo();
        if (customerInfo) {
          await this.updateUserSubscriptionStatus(customerInfo, 'init_guest');
        }
      }

      this.attachCustomerInfoListener();
      this.isInitialized = true;
      console.log('RevenueCat initialized');
    } catch (error) {
      console.error('Error initializing RevenueCat:', error);
    }
  }

  static attachCustomerInfoListener(): void {
    if (this.customerInfoListenerAttached) return;
    const bindings = getPurchasesBindings();
    if (!bindings?.Purchases) return;
    if (typeof bindings.Purchases.addCustomerInfoUpdateListener !== 'function') return;

    bindings.Purchases.addCustomerInfoUpdateListener((customerInfo: CustomerInfo) => {
      this.updateUserSubscriptionStatus(customerInfo, 'listener').catch((error) => {
        console.warn('RevenueCat customer info listener update failed:', error);
      });
    });
    this.customerInfoListenerAttached = true;
  }

  static async syncAccessState(): Promise<boolean> {
    if (!SUBS_SYNC_V2_ENABLED) return false;
    try {
      const authState = useAuthStore.getState();
      if (!this.hasValidConfig()) {
        if (authState.user?.id) {
          const snapshot = await SupabaseService.getSubscriptionSnapshot(authState.user.id);
          if (snapshot) {
            authState.updateUser({
              subscriptionType: snapshot.subscriptionType,
              adsRemoved: snapshot.adsRemoved,
              subscriptionExpiresAt: parseOptionalDate(snapshot.subscriptionExpiresAt || undefined),
              accountLinkRequiredUntil: parseOptionalDate(
                snapshot.accountLinkRequiredUntil || undefined
              ),
              rcCustomerId: snapshot.rcCustomerId || undefined,
            });
            return true;
          }
        }
        return false;
      }

      if (!this.isInitialized) {
        await this.init();
      }
      if (!this.hasValidConfig()) return false;

      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return false;

      const customerInfo = await bindings.Purchases.getCustomerInfo();
      if (!customerInfo) return false;
      await this.updateUserSubscriptionStatus(customerInfo, 'sync');
      await AnalyticsService.trackEvent('subscription_sync_result', { result: 'success' });
      return true;
    } catch (error) {
      await AnalyticsService.trackEvent('subscription_sync_result', {
        result: 'error',
        message: String((error as Error)?.message || error),
      });
      return false;
    }
  }

  static async getOfferings() {
    if (!this.isInitialized) {
      await this.init();
    }
    if (!this.hasValidConfig() || !this.isInitialized) return null;
    try {
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return null;

      const offerings = await bindings.Purchases.getOfferings();
      return offerings.current;
    } catch (error) {
      console.error('Error getting offerings:', error);
      return null;
    }
  }

  static async purchasePackage(pack: PurchasesPackage): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.init();
      }
      if (!this.hasValidConfig()) {
        console.warn('RevenueCat purchase skipped: missing SDK key configuration.');
        return false;
      }
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return false;

      const { customerInfo } = await bindings.Purchases.purchasePackage(pack);
      await this.updateUserSubscriptionStatus(customerInfo, 'purchase');

      await AnalyticsService.trackEvent('purchase_success', {
        package_id: pack.product.identifier,
        price: pack.product.price,
      });

      return true;
    } catch (error: any) {
      if (!error.userCancelled) {
        console.error('Error purchasing package:', error);
        await AnalyticsService.trackError(error, { context: 'purchase' });
      }
      return false;
    }
  }

  static async restorePurchases(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.init();
      }
      if (!this.hasValidConfig()) {
        console.warn('RevenueCat restore skipped: missing SDK key configuration.');
        return false;
      }
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return false;

      const customerInfo = await bindings.Purchases.restorePurchases();
      await this.updateUserSubscriptionStatus(customerInfo, 'restore');
      return true;
    } catch (error: any) {
      console.error('Error restoring purchases:', error);
      return false;
    }
  }

  static async presentPaywall(): Promise<PaywallPresentationStatus> {
    try {
      if (!this.isInitialized) {
        await this.init();
      }
      if (!this.hasValidConfig()) {
        return 'unavailable';
      }

      const bindings = getPurchasesBindings();
      const uiBindings = getPurchasesUIBindings();
      if (!bindings?.Purchases || !uiBindings?.RevenueCatUI) {
        return 'unavailable';
      }

      const paywallResult = await uiBindings.RevenueCatUI.presentPaywall();
      const knownResultEntries = Object.entries(uiBindings.PAYWALL_RESULT || {});
      const matchedResultName =
        knownResultEntries.find(([, value]) => value === paywallResult)?.[0] ||
        (typeof paywallResult === 'string' ? paywallResult : '');
      const normalizedResultName = String(matchedResultName).toUpperCase();

      if (normalizedResultName === 'PURCHASED') {
        const customerInfo = await bindings.Purchases.getCustomerInfo();
        if (customerInfo) {
          await this.updateUserSubscriptionStatus(customerInfo, 'paywall_purchase');
        }
        return 'purchased';
      }

      if (normalizedResultName === 'RESTORED') {
        const customerInfo = await bindings.Purchases.getCustomerInfo();
        if (customerInfo) {
          await this.updateUserSubscriptionStatus(customerInfo, 'paywall_restore');
        }
        return 'restored';
      }

      if (normalizedResultName === 'CANCELLED') return 'cancelled';
      if (normalizedResultName === 'NOT_PRESENTED') return 'not_presented';
      if (normalizedResultName === 'ERROR') return 'error';

      return 'not_presented';
    } catch (error) {
      console.error('Error presenting RevenueCat paywall:', error);
      return 'error';
    }
  }

  static async updateUserSubscriptionStatus(
    customerInfo: CustomerInfo,
    source: string = 'unknown'
  ): Promise<void> {
    const signature = this.buildCustomerInfoSignature(customerInfo);
    if (signature === this.lastCustomerInfoSignature && source === 'listener') {
      return;
    }
    this.lastCustomerInfoSignature = signature;

    const { updateUser, user } = useAuthStore.getState();

    const isPro = this.hasEntitlement(customerInfo, RC_ENTITLEMENT_PRO);
    const hasRemoveAds = this.hasEntitlement(customerInfo, RC_ENTITLEMENT_REMOVE_ADS);
    const adsRemoved = isPro || hasRemoveAds;
    const subscriptionType: 'free' | 'premium' | 'pro' = isPro ? 'pro' : 'free';
    const subscriptionExpiresAt = this.getSubscriptionExpiration(customerInfo);
    const rcCustomerId =
      typeof (customerInfo as any)?.originalAppUserId === 'string'
        ? (customerInfo as any).originalAppUserId
        : undefined;

    const isAnonymousUser = !user?.email;
    const existingLinkDeadline = user?.accountLinkRequiredUntil;
    const computedLinkDeadline =
      isAnonymousUser && subscriptionType !== 'free'
        ? existingLinkDeadline && existingLinkDeadline.getTime() > Date.now()
          ? existingLinkDeadline
          : new Date(Date.now() + ACCOUNT_LINK_GRACE_HOURS * 60 * 60 * 1000)
        : undefined;

    updateUser({
      subscriptionType,
      adsRemoved,
      subscriptionExpiresAt,
      accountLinkRequiredUntil: computedLinkDeadline,
      rcCustomerId,
    });

    if (user?.id) {
      try {
        await this.persistSubscriptionSnapshot({
          subscriptionType,
          adsRemoved,
          subscriptionExpiresAt,
          rcCustomerId,
          accountLinkRequiredUntil: computedLinkDeadline,
        });
      } catch (error) {
        console.warn('Failed to persist subscription snapshot:', error);
      }
    }

    await AnalyticsService.trackEvent('subscription_sync_result', {
      result: 'updated',
      source,
      subscription_type: subscriptionType,
      ads_removed: adsRemoved,
      link_required: Boolean(computedLinkDeadline),
    }).catch(() => {});

    console.log('User subscription status updated:', {
      source,
      isPro,
      adsRemoved,
      rcCustomerId,
    });
  }

  static async setUserId(userId: string): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.init();
      }
      if (!this.isInitialized || !this.hasValidConfig()) return;
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return;
      const loginResult = await bindings.Purchases.logIn(userId);
      if (loginResult?.customerInfo) {
        await this.updateUserSubscriptionStatus(loginResult.customerInfo, 'set_user_id');
      }
      await this.syncAccessState();
    } catch (error) {
      console.error('Error setting RevenueCat user ID:', error);
    }
  }

  static async logOutRevenueCatUser(): Promise<void> {
    try {
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases || typeof bindings.Purchases.logOut !== 'function') return;
      await bindings.Purchases.logOut();
      this.lastCustomerInfoSignature = '';
      useAuthStore.getState().updateUser({
        subscriptionType: 'free',
        adsRemoved: false,
        subscriptionExpiresAt: undefined,
        accountLinkRequiredUntil: undefined,
        rcCustomerId: undefined,
      });
    } catch (error) {
      console.warn('RevenueCat logOut failed:', error);
    }
  }

  static isConfigured(): boolean {
    return this.hasValidConfig();
  }
}
