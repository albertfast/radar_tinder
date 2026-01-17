import Purchases, { LOG_LEVEL, PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { AnalyticsService } from './AnalyticsService';

// Public SDK keys for RevenueCat (Test keys/Placeholders)
const REVENUECAT_API_KEY = Platform.select({
  ios: 'goog_placeholder_ios',
  android: 'goog_placeholder_android',
}) || '';

export class SubscriptionService {
  private static isInitialized = false;

  private static hasValidConfig(): boolean {
    return Boolean(REVENUECAT_API_KEY) && !REVENUECAT_API_KEY.includes('placeholder');
  }

  static async init(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }
      
      if (REVENUECAT_API_KEY.includes('placeholder')) {
        this.isInitialized = true;
        if (__DEV__) {
          console.log('RevenueCat: Placeholder key detected. Skipping network configuration.');
        }
        return;
      }

      Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      
      const user = useAuthStore.getState().user;
      if (user) {
        await Purchases.logIn(user.id);
      }
      
      this.isInitialized = true;
      console.log('RevenueCat initialized');
    } catch (error) {
      console.error('Error initializing RevenueCat:', error);
    }
  }

  static async getOfferings() {
    try {
      const offerings = await Purchases.getOfferings();
      return offerings.current;
    } catch (error) {
      console.error('Error getting offerings:', error);
      return null;
    }
  }

  static async purchasePackage(pack: PurchasesPackage): Promise<boolean> {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pack);
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
      const customerInfo = await Purchases.restorePurchases();
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
    const isPro = typeof customerInfo.entitlements.active['pro'] !== 'undefined';
    
    // Check for "remove_ads" entitlement (one-time)
    const adsRemoved = typeof customerInfo.entitlements.active['remove_ads'] !== 'undefined';
    
    updateUser({ 
      subscriptionType: isPro ? 'pro' : 'free',
      // We'll need to add this property to the User type or just use subscriptionType
    });

    console.log('User subscription status updated:', { isPro, adsRemoved });
  }

  static async setUserId(userId: string): Promise<void> {
    try {
      if (!this.isInitialized) return;
      if (!this.hasValidConfig()) return;
      await Purchases.logIn(userId);
    } catch (error) {
      console.error('Error setting RevenueCat user ID:', error);
    }
  }
}
