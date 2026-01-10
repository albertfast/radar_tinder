import { NativeModules } from 'react-native';

let cachedFirebaseAnalytics: any | undefined;
function getFirebaseAnalytics(): any | null {
  if (cachedFirebaseAnalytics !== undefined) return cachedFirebaseAnalytics;

  // Avoid crashing on iOS binaries that don't include RNFirebase native modules.
  if (!NativeModules?.RNFBAppModule) {
    cachedFirebaseAnalytics = null;
    return cachedFirebaseAnalytics;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/analytics');
    cachedFirebaseAnalytics = mod?.default ?? mod;
  } catch (error) {
    cachedFirebaseAnalytics = null;
  }

  return cachedFirebaseAnalytics;
}

export class AnalyticsService {
  static async init(): Promise<void> {
    try {
      const analytics = getFirebaseAnalytics();
      if (!analytics) return;

      // Firebase Analytics is initialized automatically when the app starts
      // We can set default properties here
      await analytics().setAnalyticsCollectionEnabled(true);
    } catch (error) {
      console.error('Error initializing analytics service:', error);
    }
  }

  static async trackEvent(name: string, properties: Record<string, any> = {}): Promise<void> {
    try {
      const analytics = getFirebaseAnalytics();
      if (!analytics) return;

      // Firebase Analytics only accepts strings, numbers, and booleans as property values
      const sanitizedProperties: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          sanitizedProperties[key] = value;
        } else {
          sanitizedProperties[key] = JSON.stringify(value);
        }
      }

      await analytics().logEvent(name, sanitizedProperties);
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }

  static async trackScreenView(screenName: string, properties: Record<string, any> = {}): Promise<void> {
    try {
      const analytics = getFirebaseAnalytics();
      if (!analytics) return;

      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenName,
        ...properties
      });
    } catch (error) {
       console.error('Error tracking screen view:', error);
    }
  }

  static async trackUserAction(action: string, properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('user_action', {
      action,
      ...properties,
    });
  }

  static async trackRadarDetection(properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('radar_detection', {
      detection_type: 'automatic',
      ...properties,
    });
  }

  static async trackRadarReport(properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('radar_report', {
      report_type: 'user',
      ...properties,
    });
  }

  static async trackSubscriptionAction(action: string, properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('subscription_action', {
      action,
      ...properties,
    });
  }

  static async trackError(error: Error, context: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('error', {
      error_message: error.message,
      // Stack traces can be long, so we take the first few lines
      error_stack: error.stack?.substring(0, 100),
      ...context,
    });
  }

  static async setUserProperties(properties: Record<string, any>): Promise<void> {
    try {
      const analytics = getFirebaseAnalytics();
      if (!analytics) return;

      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string' || value === null) {
          await analytics().setUserProperty(key, value);
        } else {
          await analytics().setUserProperty(key, JSON.stringify(value));
        }
      }
    } catch (error) {
      console.error('Error setting user properties:', error);
    }
  }

  static async setUserId(userId: string | null): Promise<void> {
    try {
      const analytics = getFirebaseAnalytics();
      if (!analytics) return;

      await analytics().setUserId(userId);
    } catch (error) {
      console.error('Error setting user ID:', error);
    }
  }
}
