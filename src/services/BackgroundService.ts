import { AppState } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { NotificationService } from './NotificationService';
import { LocationService } from './LocationService';
import { RadarService } from './RadarService';
import { GoogleMapsService } from './GoogleMapsService';
import { OfflineService } from './OfflineService';
import { DatabaseService } from './DatabaseService';
import { useAuthStore } from '../store/authStore';
import { useRadarStore } from '../store/radarStore';
import { useSettingsStore } from '../store/settingsStore';
import { RadarLocation } from '../types';
import { hasProAccess } from '../utils/access';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

export class BackgroundService {
  private static locationSubscription: any = null;
  private static appStateSubscription: any = null;
  private static notificationSubscription: any = null;
  private static isRunning = false;
  private static radarLocationNameCache: Record<string, string> = {};
  private static lastLocationUpdate: { latitude: number; longitude: number; timestamp: number } | null = null;
  private static lastRadarFetch:
    | { latitude: number; longitude: number; timestamp: number; radius: number }
    | null = null;
  private static lastNearbyRadars: (RadarLocation & { distance: number })[] = [];
  private static RADAR_FETCH_MIN_INTERVAL_MS_MOVING = 15000;
  private static RADAR_FETCH_MIN_INTERVAL_MS_STATIONARY = 60000;
  private static RADAR_FETCH_MIN_DISTANCE_KM = 0.25;
  private static locationPollInterval: ReturnType<typeof setInterval> | null = null;
  private static isAppActive = AppState.currentState === 'active';
  private static lastLocationUnavailableLogAt = 0;
  private static LOCATION_UNAVAILABLE_LOG_THROTTLE_MS = 60000;
  private static appStateChangeTimeout: ReturnType<typeof setTimeout> | null = null;

  static async init(): Promise<void> {
    try {
      if (this.isRunning) return;
      
      this.isRunning = true;
      
      try {
        await NotificationService.init();
      } catch (error) {
        console.error('Error initializing notification service in background:', error);
      }

      try {
        await OfflineService.init();
      } catch (error) {
        console.error('Error initializing offline service in background:', error);
      }
      
      this.setupAppStateListener();
      this.setupNotificationListener();
      
      try {
        await this.startBackgroundLocationUpdates();
      } catch (error) {
        console.error('Error starting background location updates:', error);
      }
      
      if (AppState.currentState === 'active') {
        try {
          await this.startLocationTracking();
        } catch (error) {
          console.error('Error starting location tracking:', error);
        }
      }
    } catch (error) {
      console.error('Error initializing background service:', error);
    }
  }

  private static setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      this.isAppActive = nextAppState === 'active';
      
      // Debounce AppState changes to prevent rapid toggling loops
      if (this.appStateChangeTimeout) {
        clearTimeout(this.appStateChangeTimeout);
        this.appStateChangeTimeout = null;
      }

      this.appStateChangeTimeout = setTimeout(async () => {
        if (nextAppState === 'active') {
          await this.onForeground();
        } else {
          await this.onBackground();
        }
      }, 500); // 500ms delay to filter out rapid changes like permission dialogs or keyboard events
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
      // Don't fully stop location tracking if we have background permission
      // Just reduce frequency if needed, or rely on the background task
      // await this.stopLocationTracking(); // COMMENTED OUT to prevent toggle loop
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
        // If already tracking, don't restart to avoid permission loop
        return;
      }
      
      if (this.locationPollInterval) {
        clearInterval(this.locationPollInterval);
        this.locationPollInterval = null;
      }

      if (__DEV__) {
        // ... (dev polling logic remains same)
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Location permission not granted');
          return;
        }
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 3;
        const poll = async () => {
          if (!this.isRunning) { // Removed !this.isAppActive check to allow background sim
            return;
          }
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            consecutiveErrors = 0;
            await this.handleLocationUpdate({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              heading: location.coords.heading,
              speed: location.coords.speed,
            });
          } catch (error) {
             // ... error handling
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

  // ... (rest of the class remains same)
  private static isProtectionActive = false;
  private static lastAlertSent: Record<string, number> = {};
  private static lastRadarNotificationSent: Record<string, number> = {};
  private static lastAlertStored: Record<string, number> = {};
  private static lastActiveAlertsSignature = '';
  private static ALERT_THROTTLE_MS = 60000;

  private static toShortLocationLabel(label?: string | null): string {
    if (!label) return '';
    return label
      .split(',')
      .slice(0, 2)
      .join(', ')
      .trim();
  }

  private static normalizeHeading(heading: number | null | undefined): number | null {
    if (typeof heading !== 'number' || !Number.isFinite(heading)) return null;
    const normalized = heading % 360;
    return normalized >= 0 ? normalized : normalized + 360;
  }

  private static shouldPublishLocationUpdate(
    previous:
      | {
          latitude: number;
          longitude: number;
          heading?: number | null;
          speed?: number | null;
        }
      | null,
    next: {
      latitude: number;
      longitude: number;
      heading: number | null;
      speed: number | null;
    },
    nowMs: number
  ): boolean {
    if (!previous) return true;

    const movedMeters =
      LocationService.calculateDistanceSync(
        previous.latitude,
        previous.longitude,
        next.latitude,
        next.longitude
      ) * 1000;

    const previousHeading = this.normalizeHeading(previous.heading);
    const nextHeading = this.normalizeHeading(next.heading);
    let headingDelta = 0;
    if (previousHeading !== null && nextHeading !== null) {
      headingDelta = Math.abs(nextHeading - previousHeading);
      if (headingDelta > 180) headingDelta = 360 - headingDelta;
    }

    const previousSpeed = typeof previous.speed === 'number' && Number.isFinite(previous.speed) ? previous.speed : 0;
    const nextSpeed = typeof next.speed === 'number' && Number.isFinite(next.speed) ? next.speed : 0;
    const speedDelta = Math.abs(nextSpeed - previousSpeed);
    const elapsedSinceLastUpdate = this.lastLocationUpdate
      ? nowMs - this.lastLocationUpdate.timestamp
      : Number.POSITIVE_INFINITY;

    return movedMeters >= 3 || headingDelta >= 8 || speedDelta >= 0.8 || elapsedSinceLastUpdate >= 1500;
  }

  private static async handleLocationUpdate(location: { 
    latitude: number; 
    longitude: number; 
    heading: number | null; 
    speed: number | null 
  }): Promise<void> {
    try {
      const { user } = useAuthStore.getState();
      const {
        activeAlerts,
        currentLocation: storeLocation,
        setActiveAlerts,
        setCurrentLocation,
        isRouteGuidanceActive,
      } =
        useRadarStore.getState();

      const now = Date.now();
      if (this.lastLocationUpdate) {
        const distanceKm = LocationService.calculateDistanceSync(
          location.latitude,
          location.longitude,
          this.lastLocationUpdate.latitude,
          this.lastLocationUpdate.longitude
        );
        if (distanceKm < 0.02 && now - this.lastLocationUpdate.timestamp < 3000) {
          return;
        }
      }
      this.lastLocationUpdate = {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: now,
      };

      if (this.shouldPublishLocationUpdate(storeLocation, location, now)) {
        setCurrentLocation(location);
      }

      if (!user) return;

      const speedKph = (location.speed || 0) * 3.6;
      const settings = useSettingsStore.getState();
      const alertsHydrated = settings.hasHydrated;
      const playSound = alertsHydrated && settings.voiceWarningsEnabled && settings.warningVolume > 0;
      const vibrate = alertsHydrated && settings.hapticAlertsEnabled;

      if (isRouteGuidanceActive && speedKph > 20 && !this.isProtectionActive) {
        this.isProtectionActive = true;
        if (alertsHydrated) {
          await NotificationService.sendInfoNotification('Driving Protection Active', 'Drive detected. Radar protection is now active.', {
            playSound,
            vibrate,
          });
        }
      } else if (!isRouteGuidanceActive || speedKph < 5) {
        this.isProtectionActive = false;
      }

      const radiusKm = hasProAccess(user) ? 10 : 5;
      const minIntervalMs =
        speedKph > 10 ? this.RADAR_FETCH_MIN_INTERVAL_MS_MOVING : this.RADAR_FETCH_MIN_INTERVAL_MS_STATIONARY;

      let shouldFetch = !this.lastRadarFetch || this.lastRadarFetch.radius !== radiusKm;
      if (!shouldFetch && this.lastRadarFetch) {
        const sinceLastMs = now - this.lastRadarFetch.timestamp;
        const movedKm = LocationService.calculateDistanceSync(
          location.latitude,
          location.longitude,
          this.lastRadarFetch.latitude,
          this.lastRadarFetch.longitude
        );
        shouldFetch = sinceLastMs >= minIntervalMs || movedKm >= this.RADAR_FETCH_MIN_DISTANCE_KM;
      }

      const nearbyRadars: (RadarLocation & { distance: number })[] = shouldFetch
        ? await RadarService.getNearbyRadars(location.latitude, location.longitude, radiusKm)
        : this.lastNearbyRadars
            .map((r) => ({
              ...r,
              distance: LocationService.calculateDistanceSync(
                location.latitude,
                location.longitude,
                r.latitude,
                r.longitude
              ),
            }))
            .filter((r) => r.distance <= radiusKm)
            .sort((a, b) => a.distance - b.distance);

      if (shouldFetch) {
        this.lastRadarFetch = {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: now,
          radius: radiusKm,
        };
        this.lastNearbyRadars = nearbyRadars;
      }

      if (!isRouteGuidanceActive) {
        this.isProtectionActive = false;
        if (this.lastActiveAlertsSignature || activeAlerts.length > 0) {
          this.lastActiveAlertsSignature = '';
          setActiveAlerts([]);
          await NotificationService.cancelAllNotifications().catch(() => {});
        }
        await OfflineService.cacheRadarLocations(nearbyRadars);
        return;
      }

      let baseThreshold = 0.8;
      if (speedKph > 100) baseThreshold = 2.0;
      else if (speedKph > 60) baseThreshold = 1.2;
      else if (speedKph < 30) baseThreshold = 0.5;

      const radarById = new Map<string, (RadarLocation & { distance: number })>();
      for (const radar of nearbyRadars) {
        if (radar?.id) radarById.set(radar.id, radar);
      }

      const alerts = [];
      for (const radar of nearbyRadars) {
        const distance = radar.distance || 0;
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
            id: `alert-${radar.id}`,
            radarId: radar.id,
            userId: user.id,
            type: radar.type,
            distance: distance,
            estimatedTime: distance / (speedKph || 60),
            severity: distance < (threshold / 2) ? 'high' : 'medium',
            acknowledged: false,
            createdAt: new Date(),
          });
        }
      }

      const enrichedAlerts = alerts.map((alert) => ({
        ...alert,
        locationLabel: this.toShortLocationLabel(this.radarLocationNameCache[alert.radarId]),
      }));

      const nowMs = Date.now();
      for (const alert of enrichedAlerts) {
        const lastSent = this.lastAlertSent[alert.radarId] || 0;
        if (
          alertsHydrated &&
          !alert.locationLabel &&
          nowMs - lastSent > this.ALERT_THROTTLE_MS
        ) {
          const radar = radarById.get(alert.radarId);
          if (radar) {
            try {
              const resolved = await GoogleMapsService.getReverseGeocoding(radar.latitude, radar.longitude);
              if (resolved) {
                const shortResolved = this.toShortLocationLabel(resolved);
                this.radarLocationNameCache[alert.radarId] = shortResolved;
                alert.locationLabel = shortResolved;
              }
            } catch (error) {}
          }
          this.lastAlertSent[alert.radarId] = nowMs;
        }

        const lastNotificationSent = this.lastRadarNotificationSent[alert.radarId] || 0;
        if (nowMs - lastNotificationSent > this.ALERT_THROTTLE_MS) {
          await NotificationService.sendRadarAlert(alert as any, alert.locationLabel, {
            playSound,
            vibrate,
          });
          this.lastRadarNotificationSent[alert.radarId] = nowMs;
        }

        const lastStored = this.lastAlertStored[alert.radarId] || 0;
        if (nowMs - lastStored > this.ALERT_THROTTLE_MS) {
          try {
            await DatabaseService.saveAlert(alert as any);
            this.lastAlertStored[alert.radarId] = nowMs;
          } catch (error) {
            console.warn('Failed to save alert history:', error);
          }
        }
      }

      const alertsSignature = this.buildAlertsSignature(enrichedAlerts);
      if (alertsSignature !== this.lastActiveAlertsSignature) {
        this.lastActiveAlertsSignature = alertsSignature;
        setActiveAlerts(enrichedAlerts as any);
      }

      await OfflineService.cacheRadarLocations(nearbyRadars);

    } catch (error) {
      console.error('Error handling location update:', error);
    }
  }

  private static handleNotificationResponse(response: any): void {
    const { data } = response.notification.request.content;
    
    switch (data.type) {
      case 'radar_alert':
        console.log('Radar alert notification tapped:', data.alertId);
        break;
      case 'subscription_reminder':
        console.log('Subscription reminder notification tapped');
        break;
      case 'location_reminder':
        console.log('Location reminder notification tapped');
        break;
      default:
        console.log('Unknown notification type:', data.type);
    }
  }

  static async startBackgroundTask(): Promise<void> {
    try {
      console.log('Starting background task');
      setInterval(async () => {
        await this.performBackgroundCheck();
      }, 30000);
    } catch (error) {
      console.error('Error starting background task:', error);
    }
  }

  private static async performBackgroundCheck(): Promise<void> {
    try {
      const { user } = useAuthStore.getState();
      if (!user) return;
      await OfflineService.forceSync();
      if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
        await NotificationService.sendSubscriptionReminder();
      }
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

  private static buildAlertsSignature(
    alerts: Array<{ radarId: string; distance: number; severity: string; locationLabel?: string }>
  ): string {
    if (!alerts.length) return '';
    return alerts
      .map((alert) => {
        const distanceBucket = Math.round(alert.distance * 1000);
        return `${alert.radarId}:${distanceBucket}:${alert.severity}:${alert.locationLabel || ''}`;
      })
      .sort()
      .join('|');
  }
}

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, BackgroundService.handleBackgroundLocationTask);
}
