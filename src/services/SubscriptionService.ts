import { NativeModules, Platform } from 'react-native';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { useAuthStore } from '../store/authStore';
import { AnalyticsService } from './AnalyticsService';

// Public SDK keys for RevenueCat (safe to ship in client apps)
const REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
}) || '';

type PurchasesBindings = {
  Purchases: any;
  LOG_LEVEL: any;
};

let cachedPurchasesBindings: PurchasesBindings | null | undefined;
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
  } catch (error) {
    cachedPurchasesBindings = null;
  }

  return cachedPurchasesBindings;
};

export class SubscriptionService {
  private static isInitialized = false;
  private static loggedMissingConfig = false;

  private static hasValidConfig(): boolean {
    return Boolean(REVENUECAT_API_KEY) && !REVENUECAT_API_KEY.includes('placeholder');
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

      if (__DEV__) {
        if (bindings.LOG_LEVEL?.DEBUG) {
          bindings.Purchases.setLogLevel(bindings.LOG_LEVEL.DEBUG);
        }
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

      bindings.Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      
      const user = useAuthStore.getState().user;
      if (user) {
        const loginResult = await bindings.Purchases.logIn(user.id);
        if (loginResult?.customerInfo) {
          await this.updateUserSubscriptionStatus(loginResult.customerInfo);
        }
      } else {
        const customerInfo = await bindings.Purchases.getCustomerInfo();
        if (customerInfo) {
          await this.updateUserSubscriptionStatus(customerInfo);
        }
      }
      
      this.isInitialized = true;
      console.log('RevenueCat initialized');
    } catch (error) {
      console.error('Error initializing RevenueCat:', error);
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
      await this.updateUserSubscriptionStatus(customerInfo);
      
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
      await this.updateUserSubscriptionStatus(customerInfo);
      return true;
    } catch (error: any) {
      console.error('Error restoring purchases:', error);
      return false;
    }
  }

  static async updateUserSubscriptionStatus(customerInfo: CustomerInfo): Promise<void> {
    const { updateUser } = useAuthStore.getState();
    
    // Check for "pro" entitlement
    const isPro = typeof customerInfo?.entitlements?.active?.pro !== 'undefined';
    
    // Check for "remove_ads" entitlement (one-time)
    const adsRemoved = typeof customerInfo?.entitlements?.active?.remove_ads !== 'undefined';
    
    updateUser({
      subscriptionType: isPro ? 'pro' : 'free',
      adsRemoved,
    });

    console.log('User subscription status updated:', { isPro, adsRemoved });
  }

  static async setUserId(userId: string): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.init();
      }
      if (!this.isInitialized) return;
      if (!this.hasValidConfig()) return;
      const bindings = getPurchasesBindings();
      if (!bindings?.Purchases) return;
      const loginResult = await bindings.Purchases.logIn(userId);
      if (loginResult?.customerInfo) {
        await this.updateUserSubscriptionStatus(loginResult.customerInfo);
      }
    } catch (error) {
      console.error('Error setting RevenueCat user ID:', error);
    }
  }

  static isConfigured(): boolean {
    return this.hasValidConfig();
  }
}
