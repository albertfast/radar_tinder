import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { RadarAlert } from '../types';

export class NotificationService {
  static async init(): Promise<void> {
    try {
      await this.requestPermissions();
      this.setNotificationHandler();
    } catch (error) {
      console.error('Error initializing notification service:', error);
    }
  }

  static async requestPermissions(): Promise<boolean> {
    if (!Device.isDevice) {
      console.log('Notifications are not supported on simulator');
      return false;
    }

    try {
      // Check if we are in Expo Go
      // In Expo Go SDK 53+, some notification features are restricted
      
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get notification permissions');
        return false;
      }

      // For Android, set up notification channel
      if (Platform.OS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync('radar-alerts', {
            name: 'Radar Alerts',
            description: 'Notifications for nearby radar detections',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'default',
          });
        } catch (e) {
          console.warn('Failed to set notification channel (likely Expo Go restriction):', e);
        }
      }

      return true;
    } catch (error) {
      console.warn('Error requesting notification permissions (likely Expo Go restriction):', error);
      return false;
    }
  }

  static setNotificationHandler(): void {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }

  static async sendRadarAlert(alert: RadarAlert, locationName?: string): Promise<void> {
    try {
      const title = 'Radar Detected!';
      const hasDistance = Number.isFinite(alert.distance);
      const hasEta = Number.isFinite(alert.estimatedTime);
      let body = locationName || 'Radar detected.';

      if (hasDistance) {
        const etaPart = hasEta ? ` ETA: ${alert.estimatedTime.toFixed(1)} min` : '';
        body = `Radar detected ${alert.distance.toFixed(1)} km away${locationName ? ` at ${locationName}` : ''}.${etaPart}`;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { alertId: alert.id, type: 'radar_alert' },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('Error sending radar alert notification:', error);
    }
  }

  static async sendTestNotification(): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Test Notification',
          body: 'This is a test notification from Radar Tinder',
          data: { type: 'test' },
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  }

  static async sendSubscriptionReminder(): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Upgrade Your Plan',
          body: 'Get extended radar detection range and premium features!',
          data: { type: 'subscription_reminder' },
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Error sending subscription reminder:', error);
    }
  }

  static async scheduleLocationUpdateReminder(): Promise<void> {
    try {
      // Use a valid trigger for different platforms
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Location Update',
          body: 'Please enable location services for accurate radar detection',
          data: { type: 'location_reminder' },
          autoDismiss: true,
        },
        trigger: {
          seconds: 3600, // 1 hour
          repeats: true
        },
      });
    } catch (error) {
      // Fail silently if trigger is not supported in the current environment
      if (!Device.isDevice) return;
      console.error('Error scheduling location update reminder:', error);
    }
  }

  static async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error canceling notifications:', error);
    }
  }

  static async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  static async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  static addNotificationListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  }

  static addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  static removeSubscription(subscription: Notifications.Subscription): void {
    if (subscription && typeof subscription.remove === 'function') {
      subscription.remove();
    } else {
      // Fallback for older versions if needed
      try {
        (Notifications as any).removeNotificationSubscription(subscription);
      } catch (e) {}
    }
  }
}
