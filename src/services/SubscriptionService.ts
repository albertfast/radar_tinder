import { NativeModules, Platform } from 'react-native';
import type { PurchasesPackage, CustomerInfo, PurchasesStoreProduct } from 'react-native-purchases';
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
const EXPECTED_RC_KEY_PREFIX =
  Platform.OS === 'android' ? 'goog_' : Platform.OS === 'ios' ? 'appl_' : '';

type PurchasesBindings = {
  Purchases: any;
  LOG_LEVEL: any;
  STOREKIT_VERSION?: any;
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

export type RevenueCatPlanPreference = 'weekly' | 'yearly' | 'adfree';
export type RevenueCatPackageMatchSource =
  | 'slot'
  | 'canonical_package'
  | 'canonical_product'
  | 'compat_product'
  | 'package_type';
export type RevenueCatPackageResolution = {
  offering: any | null;
  availablePackages: PurchasesPackage[];
  targetPackage: PurchasesPackage | null;
  matchSource: RevenueCatPackageMatchSource | null;
  exactMatch: boolean;
  expectedPackageIds: string[];
  expectedProductIds: string[];
  debugPackages: string;
};
export type RevenueCatStoreProductResolution = {
  availableProducts: PurchasesStoreProduct[];
  targetProduct: PurchasesStoreProduct | null;
  matchSource: Exclude<RevenueCatPackageMatchSource, 'slot' | 'canonical_package' | 'package_type'> | null;
  expectedProductIds: string[];
  debugProducts: string;
};

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
      STOREKIT_VERSION: purchasesModule?.STOREKIT_VERSION,
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

const getPackageTypeName = (pkg: any): string => String(pkg?.packageType || '').toUpperCase();

const normalizeRevenueCatToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

const uniqTokens = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  const tokens: string[] = [];

  values.forEach((value) => {
    const token = normalizeRevenueCatToken(value);
    if (!token || seen.has(token)) {
      return;
    }
    seen.add(token);
    tokens.push(token);
  });

  return tokens;
};

const RC_CANONICAL_PACKAGE_IDS: Record<RevenueCatPlanPreference, string> = {
  weekly: '$rc_weekly',
  yearly: '$rc_annual',
  adfree: '$rc_lifetime',
};

const RC_CANONICAL_PRODUCT_IDS: Record<RevenueCatPlanPreference, string> = {
  weekly: 'pro_subscription_weekly',
  yearly: 'pro_subscription_yearly',
  adfree: 'remove_ads',
};

const RC_ENV_PRODUCT_IDS: Record<RevenueCatPlanPreference, string> = {
  weekly: String(process.env.EXPO_PUBLIC_RC_PRODUCT_WEEKLY || '').trim(),
  yearly: String(process.env.EXPO_PUBLIC_RC_PRODUCT_YEARLY || '').trim(),
  adfree: String(process.env.EXPO_PUBLIC_RC_PRODUCT_ADFREE || '').trim(),
};

const RC_ENV_PACKAGE_IDS: Record<RevenueCatPlanPreference, string> = {
  weekly: String(process.env.EXPO_PUBLIC_RC_PACKAGE_WEEKLY || '').trim(),
  yearly: String(process.env.EXPO_PUBLIC_RC_PACKAGE_YEARLY || '').trim(),
  adfree: String(process.env.EXPO_PUBLIC_RC_PACKAGE_LIFETIME || '').trim(),
};

const RC_COMPAT_PRODUCT_IDS: Record<RevenueCatPlanPreference, string[]> = {
  weekly: [
    'pro_subscription:weekly',
    'weekly',
    'rc_weekly',
    'rc_weekly_399',
    'pro_subscription_weekly_399',
    'premium_subscription:weekly',
    'premium_subscription_weekly',
  ],
  yearly: [
    'pro_subscription:yearly',
    'yearly',
    'annual',
    'rc_yearly',
    'rc_yearly_1999',
    '$rc_yearly',
    'premium_subscription:yearly',
    'premium_subscription_yearly',
  ],
  adfree: [
    'remove_advertisement',
    'adfree',
    'ad_free',
    'lifetime',
    'one_time',
  ],
};

const getExpectedPackageIds = (preferredPlan: RevenueCatPlanPreference): string[] =>
  uniqTokens([RC_ENV_PACKAGE_IDS[preferredPlan], RC_CANONICAL_PACKAGE_IDS[preferredPlan]]);

const getExpectedProductIds = (preferredPlan: RevenueCatPlanPreference): string[] =>
  uniqTokens([RC_CANONICAL_PRODUCT_IDS[preferredPlan], RC_ENV_PRODUCT_IDS[preferredPlan]]);

const getCompatibleProductIds = (preferredPlan: RevenueCatPlanPreference): string[] => {
  const compatIds = RC_COMPAT_PRODUCT_IDS[preferredPlan];
  if (Platform.OS === 'ios') {
    return uniqTokens(compatIds.filter((token) => !/^rc_/.test(token)));
  }
  return uniqTokens(compatIds);
};

const getOfferingSlotCandidate = (offering: any, preferredPlan?: RevenueCatPlanPreference) => {
  if (!preferredPlan || !offering) return null;
  if (preferredPlan === 'weekly') return offering?.weekly ?? null;
  if (preferredPlan === 'yearly') return offering?.annual || offering?.yearly || null;
  return offering?.lifetime ?? null;
};

const describeRevenueCatPackage = (pkg: any): string =>
  `${String(pkg?.identifier || 'missing-id')} (${String(pkg?.product?.identifier || 'no-product-id')}) [${getPackageTypeName(pkg) || 'unknown'}]`;

const describeRevenueCatStoreProduct = (product: any): string => {
  const category = String(product?.productCategory || product?.productType || 'unknown');
  return `${String(product?.identifier || 'missing-id')} [${category}]`;
};

const findPackageMatchSource = (
  pkg: any,
  preferredPlan?: RevenueCatPlanPreference
): Exclude<RevenueCatPackageMatchSource, 'slot'> | null => {
  if (!preferredPlan || !pkg) return null;

  const identifier = normalizeRevenueCatToken(pkg?.identifier);
  const productIdentifier = normalizeRevenueCatToken(pkg?.product?.identifier);
  const expectedPackageIds = getExpectedPackageIds(preferredPlan);
  const expectedProductIds = getExpectedProductIds(preferredPlan);
  const compatibleProductIds = getCompatibleProductIds(preferredPlan);

  if (expectedPackageIds.includes(identifier)) {
    return 'canonical_package';
  }

  if (expectedProductIds.includes(productIdentifier)) {
    return 'canonical_product';
  }

  if (compatibleProductIds.includes(identifier) || compatibleProductIds.includes(productIdentifier)) {
    return 'compat_product';
  }

  if (packageTypeMatchesPreferredPlan(pkg, preferredPlan)) {
    return 'package_type';
  }

  return null;
};

const resolvePackageFromOffering = (
  offering: any,
  preferredPlan: RevenueCatPlanPreference
): RevenueCatPackageResolution => {
  const availablePackages: PurchasesPackage[] = Array.isArray(offering?.availablePackages)
    ? offering.availablePackages
    : [];
  const expectedPackageIds = getExpectedPackageIds(preferredPlan);
  const expectedProductIds = getExpectedProductIds(preferredPlan);
  const compatibleProductIds = getCompatibleProductIds(preferredPlan);
  const slotCandidate = getOfferingSlotCandidate(offering, preferredPlan);

  if (slotCandidate) {
    return {
      offering: offering || null,
      availablePackages,
      targetPackage: slotCandidate as PurchasesPackage,
      matchSource: 'slot',
      exactMatch: true,
      expectedPackageIds,
      expectedProductIds,
      debugPackages: availablePackages.map(describeRevenueCatPackage).join('\n'),
    };
  }

  const canonicalPackageMatch = availablePackages.find(
    (pkg) => findPackageMatchSource(pkg, preferredPlan) === 'canonical_package'
  );
  if (canonicalPackageMatch) {
    return {
      offering: offering || null,
      availablePackages,
      targetPackage: canonicalPackageMatch,
      matchSource: 'canonical_package',
      exactMatch: true,
      expectedPackageIds,
      expectedProductIds,
      debugPackages: availablePackages.map(describeRevenueCatPackage).join('\n'),
    };
  }

  const canonicalProductMatch = availablePackages.find(
    (pkg) => findPackageMatchSource(pkg, preferredPlan) === 'canonical_product'
  );
  if (canonicalProductMatch) {
    return {
      offering: offering || null,
      availablePackages,
      targetPackage: canonicalProductMatch,
      matchSource: 'canonical_product',
      exactMatch: true,
      expectedPackageIds,
      expectedProductIds,
      debugPackages: availablePackages.map(describeRevenueCatPackage).join('\n'),
    };
  }

  const compatProductMatch = availablePackages.find(
    (pkg) => findPackageMatchSource(pkg, preferredPlan) === 'compat_product'
  );
  if (compatProductMatch) {
    return {
      offering: offering || null,
      availablePackages,
      targetPackage: compatProductMatch,
      matchSource: 'compat_product',
      exactMatch: false,
      expectedPackageIds,
      expectedProductIds,
      debugPackages: availablePackages.map(describeRevenueCatPackage).join('\n'),
    };
  }

  const packageTypeMatch = availablePackages.find(
    (pkg) => findPackageMatchSource(pkg, preferredPlan) === 'package_type'
  );

  return {
    offering: offering || null,
    availablePackages,
    targetPackage: packageTypeMatch || null,
    matchSource: packageTypeMatch ? 'package_type' : null,
    exactMatch: Boolean(packageTypeMatch),
    expectedPackageIds,
    expectedProductIds: uniqTokens([...expectedProductIds, ...compatibleProductIds]),
    debugPackages: availablePackages.map(describeRevenueCatPackage).join('\n'),
  };
};

const resolveStoreProductFromCatalog = (
  products: PurchasesStoreProduct[],
  preferredPlan: RevenueCatPlanPreference
): RevenueCatStoreProductResolution => {
  const expectedProductIds = uniqTokens([
    ...getExpectedProductIds(preferredPlan),
    ...getCompatibleProductIds(preferredPlan),
  ]);
  const canonicalProductIds = getExpectedProductIds(preferredPlan);
  const compatibleProductIds = getCompatibleProductIds(preferredPlan);

  const canonicalProduct = products.find((product) =>
    canonicalProductIds.includes(normalizeRevenueCatToken(product?.identifier))
  );
  if (canonicalProduct) {
    return {
      availableProducts: products,
      targetProduct: canonicalProduct,
      matchSource: 'canonical_product',
      expectedProductIds,
      debugProducts: products.map(describeRevenueCatStoreProduct).join('\n'),
    };
  }

  const compatibleProduct = products.find((product) =>
    compatibleProductIds.includes(normalizeRevenueCatToken(product?.identifier))
  );

  return {
    availableProducts: products,
    targetProduct: compatibleProduct || null,
    matchSource: compatibleProduct ? 'compat_product' : null,
    expectedProductIds,
    debugProducts: products.map(describeRevenueCatStoreProduct).join('\n'),
  };
};

const packageTypeMatchesPreferredPlan = (
  pkg: any,
  preferredPlan?: RevenueCatPlanPreference
): boolean => {
  if (!preferredPlan) return false;
  const packageType = getPackageTypeName(pkg);
  if (preferredPlan === 'weekly') return packageType === 'WEEKLY';
  if (preferredPlan === 'yearly') return packageType === 'ANNUAL' || packageType === 'YEARLY';
  return packageType === 'LIFETIME';
};

const packageMatchesPreferredPlan = (
  pkg: any,
  preferredPlan?: RevenueCatPlanPreference
): boolean => {
  if (!preferredPlan) return false;
  return Boolean(findPackageMatchSource(pkg, preferredPlan));
};

const offeringMatchesPreferredPlan = (
  offering: any,
  preferredPlan?: RevenueCatPlanPreference
): boolean => {
  if (!preferredPlan || !offering) return false;

  const slotCandidate = getOfferingSlotCandidate(offering, preferredPlan);

  if (slotCandidate) {
    return true;
  }

  const availablePackages = Array.isArray(offering?.availablePackages)
    ? offering.availablePackages
    : [];

  return availablePackages.some((pkg: any) => packageMatchesPreferredPlan(pkg, preferredPlan));
};

const mergeOfferingPackages = (offerings: any[]): any[] => {
  const seen = new Set<string>();
  const merged: any[] = [];

  offerings.forEach((offering) => {
    const availablePackages = Array.isArray(offering?.availablePackages)
      ? offering.availablePackages
      : [];

    availablePackages.forEach((pkg: any) => {
      const key = `${normalizeRevenueCatToken(pkg?.identifier)}::${normalizeRevenueCatToken(
        pkg?.product?.identifier
      )}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(pkg);
    });
  });

  return merged;
};

const scoreRevenueCatOffering = (
  offering: any,
  preferredPlan?: RevenueCatPlanPreference
): number => {
  const availablePackages = Array.isArray(offering?.availablePackages)
    ? offering.availablePackages
    : [];

  if (!availablePackages.length) {
    return -1;
  }

  const baseScore = availablePackages.reduce((score: number, pkg: any) => {
    const packageType = getPackageTypeName(pkg);
    if (packageType === 'ANNUAL' || packageType === 'YEARLY') return score + 12;
    if (packageType === 'MONTHLY') return score + 10;
    if (packageType === 'WEEKLY') return score + 9;
    if (packageType === 'LIFETIME') return score + 4;
    return score + 2;
  }, availablePackages.length);

  if (offeringMatchesPreferredPlan(offering, preferredPlan)) {
    return baseScore + 100;
  }

  return baseScore;
};

const pickBestRevenueCatOffering = (
  offerings: any,
  preferredPlan?: RevenueCatPlanPreference
) => {
  const candidates: any[] = [];
  if (offerings?.current) {
    candidates.push(offerings.current);
  }

  const allOfferings = offerings?.all && typeof offerings.all === 'object'
    ? Object.values(offerings.all)
    : [];

  allOfferings.forEach((offering: any) => {
    if (offering && !candidates.includes(offering)) {
      candidates.push(offering);
    }
  });

  if (!candidates.length) {
    return null;
  }

  const selectedOffering =
    [...candidates].sort(
      (left, right) =>
        scoreRevenueCatOffering(right, preferredPlan) -
        scoreRevenueCatOffering(left, preferredPlan)
    )[0] || null;

  if (!selectedOffering) {
    return null;
  }

  return {
    ...selectedOffering,
    availablePackages: mergeOfferingPackages(candidates),
  };
};

export class SubscriptionService {
  private static isInitialized = false;
  private static initPromise: Promise<void> | null = null;
  private static loggedMissingConfig = false;
  private static customerInfoListenerAttached = false;
  private static lastCustomerInfoSignature = '';
  private static invalidCredentialsDisabled = false;
  private static loggedInvalidCredentials = false;
  private static currentRevenueCatUserId: string | null = null;

  private static hasValidConfig(): boolean {
    if (!REVENUECAT_API_KEY || REVENUECAT_API_KEY.includes('placeholder')) {
      return false;
    }
    if (EXPECTED_RC_KEY_PREFIX && !REVENUECAT_API_KEY.startsWith(EXPECTED_RC_KEY_PREFIX)) {
      return false;
    }
    return true;
  }

  private static isInvalidCredentialsError(error: unknown): boolean {
    const anyError = error as any;
    const code = String(anyError?.code || '').toLowerCase();
    const message = `${String(anyError?.message || '')} ${String(
      anyError?.underlyingErrorMessage || ''
    )}`.toLowerCase();
    return (
      code.includes('invalidcredential') ||
      message.includes('invalid credentials') ||
      message.includes('invalid play store credentials')
    );
  }

  private static markInvalidCredentials(error: unknown, context: string): void {
    this.invalidCredentialsDisabled = true;
    if (this.loggedInvalidCredentials) return;
    this.loggedInvalidCredentials = true;
    const platformKeyName =
      Platform.OS === 'android'
        ? 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY'
        : 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY';
    const message = `[RevenueCat] invalid credentials (${context}). Verify ${platformKeyName} and RevenueCat app mapping for package com.radartinder.app.`;
    if (__DEV__ && Platform.OS === 'android') {
      console.warn(
        `${message} Local sideloaded debug builds can fail Play credential checks; validate purchases with Play Internal Testing installs.`,
        error
      );
      return;
    }
    console.error(message, error);
  }

  private static async hydrateFromSnapshotIfAvailable(): Promise<boolean> {
    const authState = useAuthStore.getState();
    const restoredLocalSnapshot = authState.restoreLastKnownEntitlement();
    if (!authState.user?.id) return restoredLocalSnapshot;
    const snapshot = await SupabaseService.getSubscriptionSnapshot(authState.user.id);
    if (!snapshot) return restoredLocalSnapshot;
    authState.applyEntitlementSnapshot({
      userId: authState.user.id,
      subscriptionType: snapshot.subscriptionType,
      adsRemoved: snapshot.adsRemoved,
      subscriptionExpiresAt: parseOptionalDate(snapshot.subscriptionExpiresAt || undefined),
      accountLinkRequiredUntil: parseOptionalDate(snapshot.accountLinkRequiredUntil || undefined),
      rcCustomerId: snapshot.rcCustomerId || undefined,
      syncedAt: new Date(),
    });
    return true;
  }

  private static async ensureRevenueCatUserIdentity(explicitUserId?: string): Promise<void> {
    const bindings = getPurchasesBindings();
    if (!bindings?.Purchases || typeof bindings.Purchases.logIn !== 'function') return;

    const authUserId = explicitUserId || useAuthStore.getState().user?.id || null;
    if (!authUserId) {
      this.currentRevenueCatUserId = null;
      return;
    }
    if (this.currentRevenueCatUserId === authUserId) return;

    const loginResult = await bindings.Purchases.logIn(authUserId);
    this.currentRevenueCatUserId = authUserId;
    if (loginResult?.customerInfo) {
      await this.updateUserSubscriptionStatus(loginResult.customerInfo, 'identity_login');
    }
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
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      if (this.invalidCredentialsDisabled) {
        this.isInitialized = true;
        return;
      }

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
            const expectedHint = EXPECTED_RC_KEY_PREFIX
              ? `Expected prefix "${EXPECTED_RC_KEY_PREFIX}" for ${Platform.OS}.`
              : 'No platform key prefix check.';
            console.warn(
              `RevenueCat is not configured correctly. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY and EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY. ${expectedHint}`
            );
          }
          return;
        }

        const user = useAuthStore.getState().user;
        bindings.Purchases.configure({
          apiKey: REVENUECAT_API_KEY,
          ...(user?.id ? { appUserID: user.id } : {}),
          ...(Platform.OS === 'ios' && bindings.STOREKIT_VERSION?.STOREKIT_1
            ? { storeKitVersion: bindings.STOREKIT_VERSION.STOREKIT_1 }
            : {}),
        });
        this.currentRevenueCatUserId = null;

        if (user?.id) {
          await this.ensureRevenueCatUserIdentity(user.id);
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
        if (this.isInvalidCredentialsError(error)) {
          this.markInvalidCredentials(error, 'init');
          this.isInitialized = true;
          return;
        }
        console.error('Error initializing RevenueCat:', error);
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
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
    if (this.invalidCredentialsDisabled) {
      return await this.hydrateFromSnapshotIfAvailable();
    }
    try {
      if (!this.hasValidConfig()) {
        return await this.hydrateFromSnapshotIfAvailable();
      }

      if (!this.isInitialized) {
        await this.init();
      }
      if (this.invalidCredentialsDisabled) {
        return await this.hydrateFromSnapshotIfAvailable();
      }
      if (!this.hasValidConfig()) return false;

      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return false;

      await this.ensureRevenueCatUserIdentity();
      const customerInfo = await bindings.Purchases.getCustomerInfo();
      if (!customerInfo) return false;
      await this.updateUserSubscriptionStatus(customerInfo, 'sync');
      await AnalyticsService.trackEvent('subscription_sync_result', { result: 'success' });
      return true;
    } catch (error) {
      if (this.isInvalidCredentialsError(error)) {
        this.markInvalidCredentials(error, 'sync');
        await AnalyticsService.trackEvent('subscription_sync_result', {
          result: 'invalid_credentials',
        }).catch(() => {});
        return await this.hydrateFromSnapshotIfAvailable();
      }
      await AnalyticsService.trackEvent('subscription_sync_result', {
        result: 'error',
        message: String((error as Error)?.message || error),
      });
      return false;
    }
  }

  static async getOfferings(preferredPlan?: RevenueCatPlanPreference) {
    if (this.invalidCredentialsDisabled) return null;
    if (!this.isInitialized) {
      await this.init();
    }
    if (!this.hasValidConfig() || !this.isInitialized) return null;
    try {
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return null;

      await this.ensureRevenueCatUserIdentity();
      const offerings = await bindings.Purchases.getOfferings();
      return pickBestRevenueCatOffering(offerings, preferredPlan);
    } catch (error) {
      console.error('Error getting offerings:', error);
      return null;
    }
  }

  static async getPackageResolution(
    preferredPlan: RevenueCatPlanPreference
  ): Promise<RevenueCatPackageResolution> {
    const offering = await this.getOfferings(preferredPlan);
    return resolvePackageFromOffering(offering, preferredPlan);
  }

  static async getDirectProductResolution(
    preferredPlan: RevenueCatPlanPreference
  ): Promise<RevenueCatStoreProductResolution> {
    if (this.invalidCredentialsDisabled) {
      return {
        availableProducts: [],
        targetProduct: null,
        matchSource: null,
        expectedProductIds: uniqTokens([
          ...getExpectedProductIds(preferredPlan),
          ...getCompatibleProductIds(preferredPlan),
        ]),
        debugProducts: '',
      };
    }
    if (!this.isInitialized) {
      await this.init();
    }
    if (!this.hasValidConfig() || !this.isInitialized) {
      return {
        availableProducts: [],
        targetProduct: null,
        matchSource: null,
        expectedProductIds: uniqTokens([
          ...getExpectedProductIds(preferredPlan),
          ...getCompatibleProductIds(preferredPlan),
        ]),
        debugProducts: '',
      };
    }

    try {
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases || typeof bindings.Purchases.getProducts !== 'function') {
        return {
          availableProducts: [],
          targetProduct: null,
          matchSource: null,
          expectedProductIds: uniqTokens([
            ...getExpectedProductIds(preferredPlan),
            ...getCompatibleProductIds(preferredPlan),
          ]),
          debugProducts: '',
        };
      }

      await this.ensureRevenueCatUserIdentity();
      const productIdentifiers = uniqTokens([
        ...getExpectedProductIds(preferredPlan),
        ...getCompatibleProductIds(preferredPlan),
      ]);
      const productType = preferredPlan === 'adfree' ? 'inapp' : 'subs';
      const products = await bindings.Purchases.getProducts(productIdentifiers, productType);
      return resolveStoreProductFromCatalog(products || [], preferredPlan);
    } catch (error) {
      console.error('Error getting direct RevenueCat products:', error);
      return {
        availableProducts: [],
        targetProduct: null,
        matchSource: null,
        expectedProductIds: uniqTokens([
          ...getExpectedProductIds(preferredPlan),
          ...getCompatibleProductIds(preferredPlan),
        ]),
        debugProducts: '',
      };
    }
  }

  static async purchasePackage(pack: PurchasesPackage): Promise<boolean> {
    try {
      if (this.invalidCredentialsDisabled) return false;
      if (!this.isInitialized) {
        await this.init();
      }
      if (this.invalidCredentialsDisabled) return false;
      if (!this.hasValidConfig()) {
        console.warn('RevenueCat purchase skipped: missing SDK key configuration.');
        return false;
      }
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return false;

      await this.ensureRevenueCatUserIdentity();
      const { customerInfo } = await bindings.Purchases.purchasePackage(pack);
      await this.updateUserSubscriptionStatus(customerInfo, 'purchase');

      await AnalyticsService.trackEvent('purchase_success', {
        package_id: pack.product.identifier,
        price: pack.product.price,
      });

      return true;
    } catch (error: any) {
      if (this.isInvalidCredentialsError(error)) {
        this.markInvalidCredentials(error, 'purchase');
        return false;
      }
      if (!error.userCancelled) {
        console.error('Error purchasing package:', error);
        await AnalyticsService.trackError(error, { context: 'purchase' });
      }
      return false;
    }
  }

  static async purchaseStoreProduct(product: PurchasesStoreProduct): Promise<boolean> {
    try {
      if (this.invalidCredentialsDisabled) return false;
      if (!this.isInitialized) {
        await this.init();
      }
      if (this.invalidCredentialsDisabled) return false;
      if (!this.hasValidConfig()) {
        console.warn('RevenueCat store product purchase skipped: missing SDK key configuration.');
        return false;
      }
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases || typeof bindings.Purchases.purchaseStoreProduct !== 'function') {
        return false;
      }

      await this.ensureRevenueCatUserIdentity();
      const { customerInfo } = await bindings.Purchases.purchaseStoreProduct(product);
      await this.updateUserSubscriptionStatus(customerInfo, 'purchase_store_product');

      await AnalyticsService.trackEvent('purchase_success', {
        product_id: product.identifier,
        price: product.price,
        source: 'store_product',
      });

      return true;
    } catch (error: any) {
      if (this.isInvalidCredentialsError(error)) {
        this.markInvalidCredentials(error, 'purchase_store_product');
        return false;
      }
      if (!error.userCancelled) {
        console.error('Error purchasing store product:', error);
        await AnalyticsService.trackError(error, { context: 'purchase_store_product' });
      }
      return false;
    }
  }

  static async restorePurchases(): Promise<boolean> {
    try {
      if (this.invalidCredentialsDisabled) return false;
      if (!this.isInitialized) {
        await this.init();
      }
      if (this.invalidCredentialsDisabled) return false;
      if (!this.hasValidConfig()) {
        console.warn('RevenueCat restore skipped: missing SDK key configuration.');
        return false;
      }
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return false;

      await this.ensureRevenueCatUserIdentity();
      const customerInfo = await bindings.Purchases.restorePurchases();
      await this.updateUserSubscriptionStatus(customerInfo, 'restore');
      return true;
    } catch (error: any) {
      if (this.isInvalidCredentialsError(error)) {
        this.markInvalidCredentials(error, 'restore');
        return false;
      }
      console.error('Error restoring purchases:', error);
      return false;
    }
  }

  static async presentPaywall(): Promise<PaywallPresentationStatus> {
    try {
      if (this.invalidCredentialsDisabled) return 'unavailable';
      if (!this.isInitialized) {
        await this.init();
      }
      if (this.invalidCredentialsDisabled) return 'unavailable';
      if (!this.hasValidConfig()) {
        return 'unavailable';
      }

      const bindings = getPurchasesBindings();
      const uiBindings = getPurchasesUIBindings();
      if (!bindings?.Purchases || !uiBindings?.RevenueCatUI) {
        return 'unavailable';
      }

      await this.ensureRevenueCatUserIdentity();
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
      if (this.isInvalidCredentialsError(error)) {
        this.markInvalidCredentials(error, 'paywall');
        return 'unavailable';
      }
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

    const authState = useAuthStore.getState();
    const { user } = authState;

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

    if (user?.id) {
      authState.applyEntitlementSnapshot({
        userId: user.id,
        subscriptionType,
        adsRemoved,
        subscriptionExpiresAt,
        accountLinkRequiredUntil: computedLinkDeadline,
        rcCustomerId,
        syncedAt: new Date(),
      });
    }

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
      if (this.invalidCredentialsDisabled) return;
      if (!this.isInitialized) {
        await this.init();
      }
      if (this.invalidCredentialsDisabled) return;
      if (!this.isInitialized || !this.hasValidConfig()) return;
      await this.ensureRevenueCatUserIdentity(userId);
      await this.syncAccessState();
    } catch (error) {
      if (this.isInvalidCredentialsError(error)) {
        this.markInvalidCredentials(error, 'set_user_id');
        return;
      }
      console.error('Error setting RevenueCat user ID:', error);
    }
  }

  static async logOutRevenueCatUser(): Promise<void> {
    try {
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases || typeof bindings.Purchases.logOut !== 'function') return;
      await bindings.Purchases.logOut();
      this.currentRevenueCatUserId = null;
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
    return this.hasValidConfig() && !this.invalidCredentialsDisabled;
  }
}
