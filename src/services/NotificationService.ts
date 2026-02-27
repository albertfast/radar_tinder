import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { RadarAlert } from '../types';
import { useSettingsStore } from '../store/settingsStore';

type RadarAlertOptions = {
  playSound?: boolean;
  vibrate?: boolean;
  channelId?: string;
  allowForeground?: boolean;
};

const CHANNEL_SOUND = 'radar-alerts';
const CHANNEL_VIBRATE = 'radar-alerts-vibrate';
const CHANNEL_SILENT = 'radar-alerts-silent';

export class NotificationService {
  private static canPublishSystemNotification(options?: RadarAlertOptions): boolean {
    const allowForeground = options?.allowForeground === true;
    if (allowForeground) return true;
    return AppState.currentState !== 'active';
  }

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
          await Notifications.setNotificationChannelAsync(CHANNEL_SOUND, {
            name: 'Radar Alerts',
            description: 'Notifications for nearby radar detections',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'default',
          });

          await Notifications.setNotificationChannelAsync(CHANNEL_VIBRATE, {
            name: 'Radar Alerts (Vibrate)',
            description: 'Notifications with vibration only',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            sound: null,
          });

          await Notifications.setNotificationChannelAsync(CHANNEL_SILENT, {
            name: 'Radar Alerts (Silent)',
            description: 'Silent notifications for nearby radar detections',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0],
            sound: null,
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
        shouldPlaySound: (() => {
          const settings = useSettingsStore.getState();
          if (!settings.hasHydrated) return false;
          return settings.voiceWarningsEnabled && settings.warningVolume > 0;
        })(),
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }

  static async sendRadarAlert(
    alert: RadarAlert,
    locationName?: string,
    options?: RadarAlertOptions
  ): Promise<void> {
    try {
      if (!this.canPublishSystemNotification(options)) {
        return;
      }
      const settings = useSettingsStore.getState();
      const hydrated = settings.hasHydrated;
      const defaultPlaySound =
        hydrated && settings.voiceWarningsEnabled && settings.warningVolume > 0;
      const defaultVibrate = hydrated && settings.hapticAlertsEnabled;
      const playSound = options?.playSound ?? defaultPlaySound;
      const vibrate = options?.vibrate ?? defaultVibrate;
      const channelId =
        options?.channelId ||
        (playSound ? CHANNEL_SOUND : vibrate ? CHANNEL_VIBRATE : CHANNEL_SILENT);

      const radarLabel = (() => {
        const type = String(alert.type || '');
        if (type === 'speed_camera' || type === 'fixed') return 'Speed Camera';
        if (type === 'police' || type === 'mobile' || type === 'traffic_enforcement') return 'Speed Trap';
        if (type === 'red_light') return 'Red Light Camera';
        return 'Radar';
      })();

      const title = `${radarLabel} Ahead`;
      const hasDistance = Number.isFinite(alert.distance);
      const hasEta = Number.isFinite(alert.estimatedTime);
      const locationSource = locationName || alert.locationLabel;
      const shortLocation = locationSource
        ? locationSource.split(',').slice(0, 2).join(', ')
        : '';

      let body = shortLocation ? `${radarLabel} near ${shortLocation}.` : `${radarLabel} detected.`;

      if (hasDistance) {
        const etaPart = hasEta ? ` ETA: ${alert.estimatedTime.toFixed(1)} min` : '';
        const locationPart = shortLocation ? ` near ${shortLocation}` : '';
        body = `${radarLabel} ${alert.distance.toFixed(1)} km ahead${locationPart}.${etaPart}`;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { alertId: alert.id, type: 'radar_alert' },
          sound: playSound ? 'default' : false,
          vibrate: vibrate ? [0, 250, 250, 250] : [0],
          ...(Platform.OS === 'android' ? { channelId } : {}),
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('Error sending radar alert notification:', error);
    }
  }

  static async sendInfoNotification(
    title: string,
    body: string,
    options?: RadarAlertOptions
  ): Promise<void> {
    try {
      if (!this.canPublishSystemNotification(options)) {
        return;
      }
      const settings = useSettingsStore.getState();
      const hydrated = settings.hasHydrated;
      const defaultPlaySound =
        hydrated && settings.voiceWarningsEnabled && settings.warningVolume > 0;
      const defaultVibrate = hydrated && settings.hapticAlertsEnabled;
      const playSound = options?.playSound ?? defaultPlaySound;
      const vibrate = options?.vibrate ?? defaultVibrate;
      const channelId =
        options?.channelId ||
        (playSound ? CHANNEL_SOUND : vibrate ? CHANNEL_VIBRATE : CHANNEL_SILENT);
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { type: 'info' },
          sound: playSound ? 'default' : false,
          vibrate: vibrate ? [0, 250, 250, 250] : [0],
          ...(Platform.OS === 'android' ? { channelId } : {}),
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Error sending info notification:', error);
    }
  }

  static async silenceAllAudioNow(): Promise<void> {
    try {
      Speech.stop();
    } catch {}
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}
    try {
      // Some Android builds can still keep presented heads-up notifications alive.
      const dismissAll = (Notifications as any).dismissAllNotificationsAsync;
      if (typeof dismissAll === 'function') {
        await dismissAll();
      }
    } catch {}
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
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
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
