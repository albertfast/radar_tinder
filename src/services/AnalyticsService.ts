import { NativeModules } from 'react-native';

type AnalyticsBindings = { mod: any; analytics: any };

let cachedAnalyticsBindings: AnalyticsBindings | null | undefined;
function getAnalyticsBindings(): AnalyticsBindings | null {
  if (cachedAnalyticsBindings !== undefined) return cachedAnalyticsBindings;

  // Avoid crashing on binaries that don't include the native modules.
  if (!NativeModules?.RNFBAppModule || !NativeModules?.RNFBAnalyticsModule) {
    cachedAnalyticsBindings = null;
    return cachedAnalyticsBindings;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/analytics/lib/modular');
    const analytics = mod.getAnalytics();
    cachedAnalyticsBindings = { mod, analytics };
  } catch (error) {
    cachedAnalyticsBindings = null;
  }

  return cachedAnalyticsBindings;
}

export class AnalyticsService {
  static async init(): Promise<void> {
    try {
      const bindings = getAnalyticsBindings();
      if (!bindings) return;

      await bindings.mod.setAnalyticsCollectionEnabled(bindings.analytics, true);
    } catch (error) {
      // Keep analytics optional: missing native modules should not break the app.
    }
  }

  static async trackEvent(name: string, properties: Record<string, any> = {}): Promise<void> {
    try {
      const bindings = getAnalyticsBindings();
      if (!bindings) return;

      // Firebase Analytics only accepts strings, numbers, and booleans as property values
      const sanitizedProperties: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          sanitizedProperties[key] = value;
        } else {
          sanitizedProperties[key] = JSON.stringify(value);
        }
      }

      await bindings.mod.logEvent(bindings.analytics, name, sanitizedProperties);
    } catch (error) {
      // Optional analytics
    }
  }

  static async trackScreenView(screenName: string, properties: Record<string, any> = {}): Promise<void> {
    try {
      const bindings = getAnalyticsBindings();
      if (!bindings) return;

      await bindings.mod.logScreenView(bindings.analytics, {
        screen_name: screenName,
        screen_class: screenName,
        ...properties
      });
    } catch (error) {
      // Optional analytics
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
      const bindings = getAnalyticsBindings();
      if (!bindings) return;

      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string' || value === null) {
          await bindings.mod.setUserProperty(bindings.analytics, key, value);
        } else {
          await bindings.mod.setUserProperty(bindings.analytics, key, JSON.stringify(value));
        }
      }
    } catch (error) {
      // Optional analytics
    }
  }

  static async setUserId(userId: string | null): Promise<void> {
    try {
      const bindings = getAnalyticsBindings();
      if (!bindings) return;

      await bindings.mod.setUserId(bindings.analytics, userId);
    } catch (error) {
      // Optional analytics
    }
  }
}
