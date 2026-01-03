import { AppState } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { NotificationService } from './NotificationService';
import { LocationService } from './LocationService';
import { RadarService } from './RadarService';
import { OfflineService } from './OfflineService';
import { useAuthStore } from '../store/authStore';
import { useRadarStore } from '../store/radarStore';
import { RadarLocation } from '../types';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

export class BackgroundService {
  private static locationSubscription: any = null;
  private static appStateSubscription: any = null;
  private static notificationSubscription: any = null;
  private static isRunning = false;
  private static lastLocationUpdate: { latitude: number; longitude: number; timestamp: number } | null = null;
  private static locationPollInterval: ReturnType<typeof setInterval> | null = null;

  static async init(): Promise<void> {
    try {
      if (this.isRunning) return;
      
      this.isRunning = true;
      await NotificationService.init();
      await OfflineService.init();
      
      this.setupAppStateListener();
      this.setupNotificationListener();
      
      // CRITICAL: Start background location updates IMMEDIATELY while app is in foreground
      // Android 12+ requires foreground services to be started while app is foreground
      // This prevents "Foreground service cannot be started when the application is in the background" error
      await this.startBackgroundLocationUpdates();
      
      // Start tracking immediately if app is active
      if (AppState.currentState === 'active') {
        await this.startLocationTracking();
      }
      
      // Service ready - logging disabled to reduce noise
    } catch (error) {
      console.error('Error initializing background service:', error);
    }
  }

  private static setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        // App came to foreground
        await this.onForeground();
      } else if (nextAppState === 'background') {
        // App went to background
        await this.onBackground();
      }
    });
  }

  private static setupNotificationListener(): void {
    this.notificationSubscription = NotificationService.addNotificationResponseListener(
      (response) => {
        this.handleNotificationResponse(response);
      }
    );
  }

  private static async onForeground(): Promise<void> {
    try {
      await this.startLocationTracking();
      await NotificationService.cancelAllNotifications();
      await NotificationService.setBadgeCount(0);
    } catch (error) {
      console.error('Error in foreground handler:', error);
    }
  }

  private static async onBackground(): Promise<void> {
    try {
      // Background location is already started in init/foreground
      // Removed excessive logging to improve UX
      await this.stopLocationTracking();
    } catch (error) {
      console.error('Error in background handler:', error);
    }
  }

  private static async startBackgroundLocationUpdates(): Promise<void> {
    try {
      if (__DEV__) {
        return;
      }
      if (Constants.appOwnership === 'expo') {
        console.warn('Background location tracking is limited in Expo Go.');
        return;
      }

      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (isRegistered) {
        const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (isStarted) return;
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
        deferredUpdatesInterval: 5000,
        foregroundService: {
          notificationTitle: "Radar Tinder",
          notificationBody: "Radar detection is active",
          notificationColor: "#FF5252",
        },
      });
      console.log('Background location updates started');
    } catch (error) {
      console.error('Error starting background location updates:', error);
    }
  }

  static async handleBackgroundLocationTask({ data, error }: any): Promise<void> {
    if (error) {
      console.error('Background location task error:', error);
      return;
    }
    if (data) {
      const { locations } = data;
      const location = locations[0];
      if (location) {
        await BackgroundService.handleLocationUpdate({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          heading: location.coords.heading,
          speed: location.coords.speed,
        });
      }
    }
  }

  private static async startLocationTracking(): Promise<void> {
    try {
      if (this.locationSubscription) {
        this.locationSubscription.remove();
        this.locationSubscription = null;
      }
      if (this.locationPollInterval) {
        clearInterval(this.locationPollInterval);
        this.locationPollInterval = null;
      }

      if (__DEV__) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Location permission not granted');
          return;
        }
        const poll = async () => {
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            await this.handleLocationUpdate({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              heading: location.coords.heading,
              speed: location.coords.speed,
            });
          } catch (error) {
            console.warn('Location poll failed:', error);
          }
        };
        await poll();
        this.locationPollInterval = setInterval(poll, 5000);
        return;
      }

      this.locationSubscription = await LocationService.watchLocation(
        async (location) => {
          await this.handleLocationUpdate(location);
        }
      );
    } catch (error) {
      console.error('Error starting location tracking:', error);
    }
  }

  private static async stopLocationTracking(): Promise<void> {
    try {
      if (this.locationSubscription) {
        this.locationSubscription.remove();
        this.locationSubscription = null;
      }
      if (this.locationPollInterval) {
        clearInterval(this.locationPollInterval);
        this.locationPollInterval = null;
      }
    } catch (error) {
      console.error('Error stopping location tracking:', error);
    }
  }

  private static isProtectionActive = false;

  private static async handleLocationUpdate(location: { 
    latitude: number; 
    longitude: number; 
    heading: number | null; 
    speed: number | null 
  }): Promise<void> {
    try {
      const { user } = useAuthStore.getState();
      const { setActiveAlerts, setCurrentLocation } = useRadarStore.getState();

      const now = Date.now();
      if (this.lastLocationUpdate) {
        const distanceKm = LocationService.calculateDistanceSync(
          location.latitude,
          location.longitude,
          this.lastLocationUpdate.latitude,
          this.lastLocationUpdate.longitude
        );
        if (distanceKm < 0.02 && now - this.lastLocationUpdate.timestamp < 3000) {
          setCurrentLocation(location);
          return;
        }
      }
      this.lastLocationUpdate = {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: now,
      };

      // Update current location in store
      setCurrentLocation(location);

      if (!user) return;

      const speedKph = (location.speed || 0) * 3.6;

      // AUTO-SHIELD: Detect driving and notify user
      if (speedKph > 20 && !this.isProtectionActive) {
        this.isProtectionActive = true;
        await NotificationService.sendRadarAlert({
          id: 'auto-shield',
          distance: 0,
          severity: 'medium',
          type: 'info'
        } as any, "Radar Tinder: Yolculuk algılandı, koruma aktif! 🛡️");
      } else if (speedKph < 5) {
        this.isProtectionActive = false;
      }

      // Get nearby radars (Circular search - works even without a set destination)
      const nearbyRadars = await RadarService.getNearbyRadars(
        location.latitude,
        location.longitude,
        user.subscriptionType === 'free' ? 5 : 10
      );

      // Filter and create alerts
      let baseThreshold = 0.8;
      if (speedKph > 100) baseThreshold = 2.0;
      else if (speedKph > 60) baseThreshold = 1.2;
      else if (speedKph < 30) baseThreshold = 0.5;

      const alerts = [];
      for (const radar of nearbyRadars) {
        const distance = radar.distance || 0;
        
        // Directional filtering
        let isHeadingTowards = true;
        if (location.heading !== null && location.heading !== undefined) {
          const bearing = LocationService.calculateBearing(
            location.latitude,
            location.longitude,
            radar.latitude,
            radar.longitude
          );
          const diff = Math.abs((bearing - location.heading + 540) % 360 - 180);
          isHeadingTowards = diff < 45;
        }

        let threshold = baseThreshold;
        const isMobileRadar = radar.type === 'mobile' || radar.type === 'traffic_enforcement' || radar.type === 'police';
        if (isMobileRadar && speedKph >= 80) {
          threshold = Math.max(threshold, 4.0);
        }

        if (distance < threshold && isHeadingTowards) {
          alerts.push({
            id: `alert-${Date.now()}-${radar.id}`,
            radarId: radar.id,
            userId: user.id,
            distance: distance,
            estimatedTime: distance / (speedKph || 60),
            severity: distance < (threshold / 2) ? 'high' : 'medium',
            acknowledged: false,
            createdAt: new Date(),
          });
        }
      }

      // Update alerts in store
      setActiveAlerts(alerts as any);

      // Send notifications for high priority alerts
      for (const alert of alerts) {
        if (alert.severity === 'high') {
          await NotificationService.sendRadarAlert(alert as any);
        }
      }

      // Cache radar locations for offline use
      await OfflineService.cacheRadarLocations(nearbyRadars);

    } catch (error) {
      console.error('Error handling location update:', error);
    }
  }

  private static handleNotificationResponse(response: any): void {
    const { data } = response.notification.request.content;
    
    switch (data.type) {
      case 'radar_alert':
        // Handle radar alert notification tap
        console.log('Radar alert notification tapped:', data.alertId);
        break;
      case 'subscription_reminder':
        // Handle subscription reminder tap
        console.log('Subscription reminder notification tapped');
        break;
      case 'location_reminder':
        // Handle location reminder tap
        console.log('Location reminder notification tapped');
        break;
      default:
        console.log('Unknown notification type:', data.type);
    }
  }

  static async startBackgroundTask(): Promise<void> {
    try {
      // In a real app, you would register a background task here
      // For now, we'll simulate background processing
      console.log('Starting background task');
      
      // Simulate periodic checks
      setInterval(async () => {
        await this.performBackgroundCheck();
      }, 30000); // Every 30 seconds
    } catch (error) {
      console.error('Error starting background task:', error);
    }
  }

  private static async performBackgroundCheck(): Promise<void> {
    try {
      const { user } = useAuthStore.getState();
      if (!user) return;

      // Try to sync offline data
      await OfflineService.forceSync();

      // Check for subscription expiration
      if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
        await NotificationService.sendSubscriptionReminder();
      }

      // Clean up old data
      await OfflineService.cleanup();

    } catch (error) {
      console.error('Error in background check:', error);
    }
  }

  static async stop(): Promise<void> {
    try {
      this.isRunning = false;
      
      if (this.locationSubscription) {
        this.locationSubscription.remove();
        this.locationSubscription = null;
      }
      
      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
        this.appStateSubscription = null;
      }
      
      if (this.notificationSubscription) {
        NotificationService.removeSubscription(this.notificationSubscription);
        this.notificationSubscription = null;
      }

      await this.stopLocationTracking();
      await NotificationService.cancelAllNotifications();
      
      // Service stopped - log only on errors
    } catch (error) {
      console.error('Error stopping background service:', error);
    }
  }

  static getStatus(): {
    isRunning: boolean;
    isLocationTracking: boolean;
  } {
    return {
      isRunning: this.isRunning,
      isLocationTracking: this.locationSubscription !== null,
    };
  }
}

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, BackgroundService.handleBackgroundLocationTask);
}
