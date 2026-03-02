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
import { AnalyticsService } from './AnalyticsService';
import { useAuthStore } from '../store/authStore';
import { useRadarStore } from '../store/radarStore';
import { useSettingsStore } from '../store/settingsStore';
import { RadarLocation } from '../types';
import { hasProAccess } from '../utils/access';
import { readBooleanFlag } from '../utils/flags';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

export class BackgroundService {
  private static locationSubscription: any = null;
  private static appStateSubscription: any = null;
  private static notificationSubscription: any = null;
  private static isRunning = false;
  private static radarLocationNameCache: Record<string, string> = {};
  private static lastLocationUpdate: {
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
    accuracy: number | null;
    timestamp: number;
  } | null = null;
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
  private static RADAR_ALERT_SCOPE_V2_ENABLED = readBooleanFlag(
    'EXPO_PUBLIC_RADAR_ALERT_SCOPE_V2',
    true
  );

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
          accuracy:
            typeof location.coords.accuracy === 'number' && Number.isFinite(location.coords.accuracy)
              ? location.coords.accuracy
              : null,
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

      try {
        this.locationSubscription = await LocationService.watchLocation(
          async (location) => {
            await this.handleLocationUpdate(location);
          },
          { forDriving: true }
        );
        return;
      } catch (watchError) {
        if (!__DEV__) {
          throw watchError;
        }
      }

      // Dev-only fallback for environments where location watch subscriptions are unavailable.
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission not granted');
        return;
      }
      const poll = async () => {
        if (!this.isRunning) {
          return;
        }
        try {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
          });
          await this.handleLocationUpdate({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
            accuracy:
              typeof location.coords.accuracy === 'number' && Number.isFinite(location.coords.accuracy)
                ? location.coords.accuracy
                : null,
          });
        } catch {}
      };
      await poll();
      this.locationPollInterval = setInterval(poll, 2500);
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
  private static lastRadarNotificationByKey: Record<string, number> = {};
  private static lastAlertStored: Record<string, number> = {};
  private static lastActiveAlertsSignature = '';
  private static ALERT_THROTTLE_MS = 60000;
  private static NOTIFICATION_DEDUPE_MS = 120000;
  private static lastRadarAlertMode = '';
  private static routeSessionId: string | null = null;
  private static lastRouteGuidanceState = false;
  private static protectionSessionAnnouncedFor: string | null = null;

  private static toShortLocationLabel(label?: string | null): string {
    if (!label) return '';
    const parts = label
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return '';

    const stripHouseNumber = (value: string) => value.replace(/^\d+[A-Za-z-]*\s+/, '').trim();
    const first = stripHouseNumber(parts[0]);
    const second = parts[1] ? stripHouseNumber(parts[1]) : '';
    const streetToken = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way)\b/i;
    if (first && second && streetToken.test(first) && streetToken.test(second)) {
      return `${first} & ${second}`;
    }

    return [first || parts[0], second].filter(Boolean).slice(0, 2).join(', ');
  }

  private static normalizeHeading(heading: number | null | undefined): number | null {
    if (typeof heading !== 'number' || !Number.isFinite(heading)) return null;
    if (heading < 0) return null;
    const normalized = heading % 360;
    return normalized >= 0 ? normalized : normalized + 360;
  }

  private static getDirectionBucket(heading: number | null | undefined): string {
    const normalized = this.normalizeHeading(heading);
    if (normalized === null) return 'unknown';
    const bucket = Math.round(normalized / 30) * 30;
    return `${bucket % 360}`;
  }

  private static distancePointToSegmentMeters(
    pointLat: number,
    pointLon: number,
    aLat: number,
    aLon: number,
    bLat: number,
    bLon: number
  ): number {
    const toXY = (lat: number, lon: number) => {
      const x = lon * 111320 * Math.cos((lat * Math.PI) / 180);
      const y = lat * 110540;
      return { x, y };
    };
    const p = toXY(pointLat, pointLon);
    const a = toXY(aLat, aLon);
    const b = toXY(bLat, bLon);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const denom = abx * abx + aby * aby;
    const t = denom <= 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    const dx = p.x - cx;
    const dy = p.y - cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private static minDistanceToRouteMeters(
    radar: { latitude: number; longitude: number },
    routeCoords: Array<{ latitude: number; longitude: number }>
  ): number {
    if (!routeCoords.length) return Number.POSITIVE_INFINITY;
    if (routeCoords.length === 1) {
      return (
        LocationService.calculateDistanceSync(
          radar.latitude,
          radar.longitude,
          routeCoords[0].latitude,
          routeCoords[0].longitude
        ) * 1000
      );
    }

    let minMeters = Number.POSITIVE_INFINITY;
    for (let i = 0; i < routeCoords.length - 1; i += 1) {
      const a = routeCoords[i];
      const b = routeCoords[i + 1];
      const d = this.distancePointToSegmentMeters(
        radar.latitude,
        radar.longitude,
        a.latitude,
        a.longitude,
        b.latitude,
        b.longitude
      );
      if (d < minMeters) minMeters = d;
      if (minMeters <= 120) break;
    }
    return minMeters;
  }

  private static ensureRouteSession(isRouteGuidanceActive: boolean): void {
    if (isRouteGuidanceActive && !this.lastRouteGuidanceState) {
      this.routeSessionId = `route-${Date.now()}`;
      this.protectionSessionAnnouncedFor = null;
      this.lastRadarNotificationByKey = {};
    } else if (!isRouteGuidanceActive && this.lastRouteGuidanceState) {
      this.routeSessionId = null;
      this.protectionSessionAnnouncedFor = null;
      this.lastRadarNotificationByKey = {};
    }
    this.lastRouteGuidanceState = isRouteGuidanceActive;
  }

  private static shouldPublishLocationUpdate(
    previous:
      | {
          latitude: number;
          longitude: number;
          heading?: number | null;
          speed?: number | null;
          accuracy?: number | null;
        }
      | null,
    next: {
      latitude: number;
      longitude: number;
      heading: number | null;
      speed: number | null;
      accuracy?: number | null;
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
    const nextSpeedKph = Math.max(0, nextSpeed * 3.6);
    const lowAccuracy = typeof next.accuracy === 'number' && Number.isFinite(next.accuracy) && next.accuracy > 55;
    const elapsedSinceLastUpdate = this.lastLocationUpdate
      ? nowMs - this.lastLocationUpdate.timestamp
      : Number.POSITIVE_INFINITY;

    const minMovedMeters =
      nextSpeedKph >= 90 ? 2.2 : nextSpeedKph >= 50 ? 1.6 : nextSpeedKph >= 20 ? 1.0 : 0.7;
    const minHeadingDelta = nextSpeedKph >= 50 ? 4 : 6;
    const minElapsedMs = nextSpeedKph >= 90 ? 350 : nextSpeedKph >= 50 ? 450 : 700;

    if (lowAccuracy && movedMeters < 5 && elapsedSinceLastUpdate < 900) {
      return false;
    }

    return (
      movedMeters >= minMovedMeters ||
      headingDelta >= minHeadingDelta ||
      speedDelta >= 0.35 ||
      elapsedSinceLastUpdate >= minElapsedMs
    );
  }

  private static async handleLocationUpdate(location: {
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
    accuracy?: number | null;
  }): Promise<void> {
    try {
      const { user } = useAuthStore.getState();
      const {
        activeAlerts,
        currentLocation: storeLocation,
        setActiveAlerts,
        setCurrentLocation,
        isRouteGuidanceActive,
        routeGuidancePath,
      } = useRadarStore.getState();

      this.ensureRouteSession(isRouteGuidanceActive);

      const now = Date.now();
      const previousUpdate = this.lastLocationUpdate;
      if (previousUpdate) {
        const movedMeters =
          LocationService.calculateDistanceSync(
            location.latitude,
            location.longitude,
            previousUpdate.latitude,
            previousUpdate.longitude
          ) * 1000;
        const elapsedMs = now - previousUpdate.timestamp;
        const speedFromSensorKph =
          typeof location.speed === 'number' && Number.isFinite(location.speed) && location.speed >= 0
            ? location.speed * 3.6
            : null;
        const lowSignal =
          typeof location.accuracy === 'number' && Number.isFinite(location.accuracy) && location.accuracy > 65;
        const tinyMovement =
          movedMeters < 0.9 &&
          elapsedMs < 900 &&
          (speedFromSensorKph == null || speedFromSensorKph < 18);
        if (tinyMovement || (lowSignal && movedMeters < 4 && elapsedMs < 1200)) {
          return;
        }

        const distanceKm = movedMeters / 1000;
        if (distanceKm > 0.35 && elapsedMs < 2000 && (speedFromSensorKph == null || speedFromSensorKph < 45)) {
          // Ignore likely GPS jumps that would create jittery camera snaps.
          return;
        }

        const previousAccuracy =
          typeof previousUpdate.accuracy === 'number' && Number.isFinite(previousUpdate.accuracy)
            ? previousUpdate.accuracy
            : null;
        if (
          previousAccuracy != null &&
          typeof location.accuracy === 'number' &&
          Number.isFinite(location.accuracy) &&
          location.accuracy > previousAccuracy + 45 &&
          movedMeters < 12
        ) {
          return;
        }

        const prevDistanceKm = LocationService.calculateDistanceSync(
          location.latitude,
          location.longitude,
          previousUpdate.latitude,
          previousUpdate.longitude
        );
        if (prevDistanceKm < 0.00035 && elapsedMs < 550) {
          return;
        }
      }

      const normalizedHeading = this.normalizeHeading(location.heading);
      const normalizedLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        heading: normalizedHeading,
        speed:
          typeof location.speed === 'number' && Number.isFinite(location.speed) && location.speed >= 0
            ? location.speed
            : null,
        accuracy:
          typeof location.accuracy === 'number' && Number.isFinite(location.accuracy)
            ? location.accuracy
            : null,
      };

      let inferredSpeedKph: number | null = null;
      if (normalizedLocation.speed == null && previousUpdate) {
        const elapsedSeconds = (now - previousUpdate.timestamp) / 1000;
        if (elapsedSeconds >= 0.7 && elapsedSeconds <= 12) {
          const movedKm = LocationService.calculateDistanceSync(
            previousUpdate.latitude,
            previousUpdate.longitude,
            normalizedLocation.latitude,
            normalizedLocation.longitude
          );
          inferredSpeedKph = Math.max(0, Math.min(220, (movedKm / elapsedSeconds) * 3600));
        }
      }

      const speedFromSensorKph =
        normalizedLocation.speed != null ? Math.max(0, normalizedLocation.speed * 3.6) : null;
      const hasReliableSpeed = speedFromSensorKph != null || inferredSpeedKph != null;
      const speedKph = speedFromSensorKph ?? inferredSpeedKph ?? 0;

      this.lastLocationUpdate = {
        ...normalizedLocation,
        timestamp: now,
      };

      if (this.shouldPublishLocationUpdate(storeLocation, normalizedLocation, now)) {
        setCurrentLocation(normalizedLocation);
      }

      if (!user) return;

      const settings = useSettingsStore.getState();
      const alertsHydrated = settings.hasHydrated;
      const playSound = alertsHydrated && settings.voiceWarningsEnabled && settings.warningVolume > 0;
      const vibrate = alertsHydrated && settings.hapticAlertsEnabled;

      if (
        isRouteGuidanceActive &&
        speedKph > 20 &&
        this.protectionSessionAnnouncedFor !== this.routeSessionId
      ) {
        this.isProtectionActive = true;
        if (alertsHydrated) {
          await NotificationService.sendInfoNotification(
            'Driving Protection Active',
            'Drive detected. Radar protection is now active.',
            {
              playSound,
              vibrate,
            }
          );
        }
        this.protectionSessionAnnouncedFor = this.routeSessionId;
      } else if (speedKph < 5) {
        this.isProtectionActive = false;
      }

      const radiusKm = hasProAccess(user) ? 10 : 5;
      const minIntervalMs =
        speedKph > 10
          ? this.RADAR_FETCH_MIN_INTERVAL_MS_MOVING
          : this.RADAR_FETCH_MIN_INTERVAL_MS_STATIONARY;

      let shouldFetch = !this.lastRadarFetch || this.lastRadarFetch.radius !== radiusKm;
      if (!shouldFetch && this.lastRadarFetch) {
        const sinceLastMs = now - this.lastRadarFetch.timestamp;
        const movedKm = LocationService.calculateDistanceSync(
          normalizedLocation.latitude,
          normalizedLocation.longitude,
          this.lastRadarFetch.latitude,
          this.lastRadarFetch.longitude
        );
        shouldFetch = sinceLastMs >= minIntervalMs || movedKm >= this.RADAR_FETCH_MIN_DISTANCE_KM;
      }

      const nearbyRadars: (RadarLocation & { distance: number })[] = shouldFetch
        ? await RadarService.getNearbyRadars(
            normalizedLocation.latitude,
            normalizedLocation.longitude,
            radiusKm
          )
        : this.lastNearbyRadars
            .map((radar) => ({
              ...radar,
              distance: LocationService.calculateDistanceSync(
                normalizedLocation.latitude,
                normalizedLocation.longitude,
                radar.latitude,
                radar.longitude
              ),
            }))
            .filter((radar) => radar.distance <= radiusKm)
            .sort((a, b) => a.distance - b.distance);

      if (shouldFetch) {
        this.lastRadarFetch = {
          latitude: normalizedLocation.latitude,
          longitude: normalizedLocation.longitude,
          timestamp: now,
          radius: radiusKm,
        };
        this.lastNearbyRadars = nearbyRadars;
      }

      const routeMode = isRouteGuidanceActive && routeGuidancePath.length > 1;
      const allowFreeDriveAlerts =
        this.RADAR_ALERT_SCOPE_V2_ENABLED && !routeMode && speedKph >= 8;
      const radarAlertMode = routeMode ? 'route' : allowFreeDriveAlerts ? 'free_drive' : 'idle';
      if (radarAlertMode !== this.lastRadarAlertMode) {
        this.lastRadarAlertMode = radarAlertMode;
        AnalyticsService.trackEvent('radar_alert_mode', {
          mode: radarAlertMode,
          speed_kph: Math.round(speedKph),
          reliable_speed: hasReliableSpeed,
        }).catch(() => {});
      }
      if (!routeMode && !allowFreeDriveAlerts) {
        this.isProtectionActive = false;
        if (this.lastActiveAlertsSignature || activeAlerts.length > 0) {
          this.lastActiveAlertsSignature = '';
          setActiveAlerts([]);
          await NotificationService.cancelAllNotifications().catch(() => {});
        }
        await OfflineService.cacheRadarLocations(nearbyRadars);
        return;
      }

      this.isProtectionActive = true;

      let baseThreshold = 0.8;
      if (routeMode) {
        if (speedKph > 100) baseThreshold = 2.0;
        else if (speedKph > 60) baseThreshold = 1.2;
        else if (speedKph < 30) baseThreshold = 0.5;
      } else {
        if (speedKph > 110) baseThreshold = 2.6;
        else if (speedKph > 80) baseThreshold = 1.9;
        else if (speedKph > 50) baseThreshold = 1.35;
        else if (speedKph > 20) baseThreshold = 0.9;
        else baseThreshold = 0.6;
        if (!hasReliableSpeed) {
          baseThreshold = Math.max(baseThreshold, 1.05);
        }
      }

      const radarById = new Map<string, RadarLocation & { distance: number }>();
      for (const radar of nearbyRadars) {
        if (radar?.id) radarById.set(radar.id, radar);
      }

      const alerts = [];
      for (const radar of nearbyRadars) {
        const distance = radar.distance || 0;
          const relevance = RadarService.evaluateRouteRelevance({
            radar,
            currentLocation: {
              latitude: normalizedLocation.latitude,
              longitude: normalizedLocation.longitude,
              heading: normalizedHeading,
            },
            routeCoords: routeMode ? routeGuidancePath : [],
            speedKph: hasReliableSpeed ? speedKph : 5,
            maxCorridorMeters: routeMode ? 170 : 240,
            maxHeadingDeltaDeg: routeMode ? 70 : 75,
            etaSecondsWindow: hasReliableSpeed
              ? routeMode
                ? [5, 240]
                : [8, 220]
              : [0, Number.MAX_SAFE_INTEGER],
          });

        let threshold = baseThreshold;
        const isMobileRadar =
          radar.type === 'mobile' || radar.type === 'traffic_enforcement' || radar.type === 'police';
        if (isMobileRadar && speedKph >= 80) {
          threshold = Math.max(threshold, routeMode ? 4.0 : 5.0);
        }

        const headingMatched = relevance.headingDeltaDeg == null || relevance.headingDeltaDeg <= (routeMode ? 70 : 75);
        const relevanceMatched = routeMode
          ? relevance.isRelevant
          : headingMatched && (hasReliableSpeed ? relevance.etaSeconds <= 220 : true);

        if (distance < threshold && relevanceMatched) {
          const distanceScore = 1 - Math.min(distance / Math.max(threshold, 0.1), 1);
          const corridorScore =
            relevance.corridorDistanceMeters == null
              ? 1
              : 1 - Math.min(relevance.corridorDistanceMeters / (routeMode ? 120 : 240), 1);
          alerts.push({
            id: `alert-${radar.id}`,
            radarId: radar.id,
            userId: user.id,
            type: radar.type,
            distance,
            estimatedTime: relevance.etaSeconds / 60,
            severity: distance < threshold / 2 ? 'high' : distance < threshold * 0.8 ? 'medium' : 'low',
            routeMatched: relevance.routeMatched,
            corridorDistanceMeters: relevance.corridorDistanceMeters,
            etaSeconds: relevance.etaSeconds,
            routeMatchScore: Number(((distanceScore * 0.55) + (corridorScore * 0.45)).toFixed(3)),
            headingDeltaDeg: relevance.headingDeltaDeg ?? null,
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
        if (alertsHydrated && !alert.locationLabel && nowMs - lastSent > this.ALERT_THROTTLE_MS) {
          const radar = radarById.get(alert.radarId);
          if (radar) {
            try {
              const resolved = await GoogleMapsService.getReverseGeocoding(
                radar.latitude,
                radar.longitude
              );
              if (resolved) {
                const shortResolved = this.toShortLocationLabel(resolved);
                this.radarLocationNameCache[alert.radarId] = shortResolved;
                alert.locationLabel = shortResolved;
              }
            } catch {}
          }
          this.lastAlertSent[alert.radarId] = nowMs;
        }

        const directionBucket = this.getDirectionBucket(normalizedHeading);
        const dedupeScope = routeMode ? this.routeSessionId || 'route' : 'free-drive';
        const dedupeKey = `${alert.radarId}:${dedupeScope}:${directionBucket}`;
        const lastNotificationByKey = this.lastRadarNotificationByKey[dedupeKey] || 0;
        const lastNotificationSent = this.lastRadarNotificationSent[alert.radarId] || 0;
        if (
          nowMs - lastNotificationSent > this.ALERT_THROTTLE_MS &&
          nowMs - lastNotificationByKey > this.NOTIFICATION_DEDUPE_MS
        ) {
          await NotificationService.sendRadarAlert(alert as any, alert.locationLabel, {
            playSound,
            vibrate,
          });
          this.lastRadarNotificationSent[alert.radarId] = nowMs;
          this.lastRadarNotificationByKey[dedupeKey] = nowMs;
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

      const previousSignature = this.lastActiveAlertsSignature;
      const alertsSignature = this.buildAlertsSignature(enrichedAlerts);
      if (alertsSignature !== previousSignature) {
        this.lastActiveAlertsSignature = alertsSignature;
        setActiveAlerts(enrichedAlerts as any);
      }
      if (!alertsSignature && (previousSignature || activeAlerts.length > 0)) {
        await NotificationService.cancelAllNotifications().catch(() => {});
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
