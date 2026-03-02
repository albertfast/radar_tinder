import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import { RadarAlert } from '../../../types';
import { useRadarStore } from '../../../store/radarStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { RadarService } from '../../../services/RadarService';
import { LocationService } from '../../../services/LocationService';
import { GoogleMapsService } from '../../../services/GoogleMapsService';
import { NotificationService } from '../../../services/NotificationService';
import { VoiceGuidanceService } from '../../../services/VoiceGuidanceService';
import { formatDistance } from '../../../utils/format';
import { useSpeedSmoothing } from './useSpeedSmoothing';
import { MAP_TRACE_ENABLED, ROUTE_RELEVANCE_V2_ENABLED } from '../constants';
import { TabType } from '../types';
import { extractShortStreetLabel, formatRadarLabel } from '../utils/radarFormatters';

type UseRadarDataSyncParams = {
  currentLocation: any;
  setCurrentLocation: (location: any) => void;
  currentLocationRef: React.MutableRefObject<any>;
  mapRef: React.RefObject<MapView | null>;
  allowUiLocationUpdates: boolean;
  isDriving: boolean;
  activeTab: TabType;
  followHeading: boolean;
  isTypingRef: React.MutableRefObject<boolean>;
  manualPanModeRef: React.MutableRefObject<boolean>;
  hasCenteredMapRef: React.MutableRefObject<boolean>;
  activeAlerts: RadarAlert[];
  hasHydrated: boolean;
  hapticAlertsEnabled: boolean;
  voicePlaybackEnabled: boolean;
  warningVolume: number;
  unitSystem: 'metric' | 'imperial';
  setRadarLocations: (radars: any[]) => void;
};

const normalizeHeading = (heading: number) => {
  const normalized = heading % 360;
  return normalized >= 0 ? normalized : normalized + 360;
};

const calculateBearing = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) => {
  const startLat = (fromLat * Math.PI) / 180;
  const endLat = (toLat * Math.PI) / 180;
  const deltaLng = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);
  const angle = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeHeading(angle);
};

const projectForwardCoordinate = (
  latitude: number,
  longitude: number,
  bearingDeg: number,
  distanceMeters: number
) => {
  const earthRadiusMeters = 6378137;
  const angularDistance = distanceMeters / earthRadiusMeters;
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const latitudeRad = (latitude * Math.PI) / 180;
  const longitudeRad = (longitude * Math.PI) / 180;

  const projectedLatitude = Math.asin(
    Math.sin(latitudeRad) * Math.cos(angularDistance) +
      Math.cos(latitudeRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );
  const projectedLongitude =
    longitudeRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latitudeRad),
      Math.cos(angularDistance) - Math.sin(latitudeRad) * Math.sin(projectedLatitude)
    );

  return {
    latitude: (projectedLatitude * 180) / Math.PI,
    longitude: (projectedLongitude * 180) / Math.PI,
  };
};

export function useRadarDataSync({
  currentLocation,
  setCurrentLocation,
  currentLocationRef,
  mapRef,
  allowUiLocationUpdates,
  isDriving,
  activeTab,
  followHeading,
  isTypingRef,
  manualPanModeRef,
  hasCenteredMapRef,
  activeAlerts,
  hasHydrated,
  hapticAlertsEnabled,
  voicePlaybackEnabled,
  warningVolume,
  unitSystem,
  setRadarLocations,
}: UseRadarDataSyncParams) {
  const [nearbyRadars, setNearbyRadars] = useState<any[]>([]);
  const [closestRadarHint, setClosestRadarHint] = useState('');
  const [radarLocationHints, setRadarLocationHints] = useState<Record<string, string>>({});

  const { uiSpeedKph: currentSpeed, pushLocationSample, resetSpeed } = useSpeedSmoothing({
    calculateDistanceSync: LocationService.calculateDistanceSync,
  });

  const currentSpeedRef = useRef(currentSpeed);
  useEffect(() => {
    currentSpeedRef.current = currentSpeed;
  }, [currentSpeed]);

  const nearbyRadarsRef = useRef<any[]>([]);
  const lastCameraUpdateRef = useRef(0);
  const lastCameraCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastCameraHeadingRef = useRef<number | null>(null);
  const lastUiLocationRef = useRef<any>(null);
  const lastUiLocationUpdateAtRef = useRef(0);
  const lastAnnouncedAlertIdRef = useRef<string | null>(null);
  const closestRadarLabelCacheRef = useRef<Record<string, string>>({});
  const closestRadarLabelRequestRef = useRef<Record<string, boolean>>({});
  const radarHintRequestRef = useRef<Record<string, boolean>>({});
  const previousHeadingLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastValidHeadingRef = useRef(0);
  const smoothedLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation, currentLocationRef]);

  const activeAlert = useMemo<RadarAlert | null>(() => {
    const unacknowledged = (activeAlerts as RadarAlert[]).filter((alert) => !alert.acknowledged);
    return unacknowledged.sort((a, b) => a.distance - b.distance)[0] || null;
  }, [activeAlerts]);

  const closestRadar = useMemo(() => {
    if (!nearbyRadars || nearbyRadars.length === 0) return null;
    return [...nearbyRadars].sort((a, b) => a.distance - b.distance)[0];
  }, [nearbyRadars]);

  const hasSameRadarSnapshot = useCallback((a: any[], b: any[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      const left = a[index];
      const right = b[index];
      if (!left || !right) return false;
      if (left.id !== right.id) return false;
      if (left.type !== right.type) return false;
      const leftDistance = Math.round((left.distance || 0) * 100);
      const rightDistance = Math.round((right.distance || 0) * 100);
      if (leftDistance !== rightDistance) return false;
    }
    return true;
  }, []);

  const applyRouteRelevanceFilter = useCallback(
    (incoming: any[], loc: { latitude: number; longitude: number; heading?: number | null }) => {
      if (!ROUTE_RELEVANCE_V2_ENABLED) return incoming;
      const routeState = useRadarStore.getState();
      if (!routeState.isRouteGuidanceActive || routeState.routeGuidancePath.length < 2) {
        return incoming;
      }

      const relevant = RadarService.filterRouteRelevantRadars(incoming, {
        currentLocation: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          heading: typeof loc.heading === 'number' ? loc.heading : null,
        },
        routeCoords: routeState.routeGuidancePath,
        speedKph: Math.max(currentSpeedRef.current || 0, 10),
        maxCorridorMeters: 180,
        maxHeadingDeltaDeg: 75,
        etaSecondsWindow: [0, 3600],
        requireEtaWindow: false,
      });

      return relevant.length > 0 ? relevant : incoming;
    },
    []
  );

  const updateNearbyRadarsState = useCallback(
    (incoming: any[]) => {
      setNearbyRadars((prev) => {
        if (hasSameRadarSnapshot(prev, incoming)) {
          return prev;
        }
        nearbyRadarsRef.current = incoming;
        setRadarLocations(incoming);
        return incoming;
      });
    },
    [hasSameRadarSnapshot, setRadarLocations]
  );

  useEffect(() => {
    if (!hasHydrated) return;
    if (!activeAlert) {
      lastAnnouncedAlertIdRef.current = null;
      return;
    }
    if (!isDriving) return;
    if (lastAnnouncedAlertIdRef.current === activeAlert.id) return;
    lastAnnouncedAlertIdRef.current = activeAlert.id;

    if (hapticAlertsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }

    if (voicePlaybackEnabled) {
      const liveSettings = useSettingsStore.getState();
      const liveVoiceEnabled =
        liveSettings.hasHydrated && liveSettings.voiceWarningsEnabled && liveSettings.warningVolume > 0;
      if (!liveVoiceEnabled) {
        return;
      }
      const etaMinutes = Math.max(1, Math.round(activeAlert.estimatedTime * 60));
      const distanceText = formatDistance(activeAlert.distance, unitSystem);
      const locationSuffix = activeAlert.locationLabel
        ? ` near ${activeAlert.locationLabel.split(',').slice(0, 2).join(', ')}`
        : '';
      const message = `${formatRadarLabel(activeAlert.type)} ahead${locationSuffix}. ${distanceText}. Estimated ${etaMinutes} minutes.`;
      VoiceGuidanceService.speak(message, {
        cooldownKey: `active_alert:${activeAlert.id}`,
        cooldownMs: 6000,
      });
    }
  }, [
    activeAlert,
    hasHydrated,
    hapticAlertsEnabled,
    isDriving,
    unitSystem,
    voicePlaybackEnabled,
    warningVolume,
  ]);

  useEffect(() => {
    if (!voicePlaybackEnabled) {
      VoiceGuidanceService.syncMuteState().catch(() => {});
      NotificationService.silenceAllAudioNow().catch(() => {
        VoiceGuidanceService.stop().catch(() => {});
      });
    }
  }, [voicePlaybackEnabled]);

  useEffect(() => {
    if (!closestRadar?.id) {
      setClosestRadarHint('');
      return;
    }
    const cached = closestRadarLabelCacheRef.current[closestRadar.id];
    if (cached) {
      setClosestRadarHint(cached);
      return;
    }

    const latitude = Number(closestRadar.latitude);
    const longitude = Number(closestRadar.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setClosestRadarHint('');
      return;
    }
    if (closestRadarLabelRequestRef.current[closestRadar.id]) {
      return;
    }

    let cancelled = false;
    closestRadarLabelRequestRef.current[closestRadar.id] = true;
    (async () => {
      try {
        const fullLabel = await GoogleMapsService.getReverseGeocoding(latitude, longitude);
        if (cancelled) return;
        const shortLabel = extractShortStreetLabel(fullLabel);
        if (shortLabel) {
          closestRadarLabelCacheRef.current[closestRadar.id] = shortLabel;
          setClosestRadarHint(shortLabel);
        } else {
          setClosestRadarHint('');
        }
      } catch {
        if (!cancelled) {
          setClosestRadarHint('');
        }
      } finally {
        delete closestRadarLabelRequestRef.current[closestRadar.id];
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [closestRadar]);

  useEffect(() => {
    const candidates = nearbyRadars.slice(0, 10);
    for (const radar of candidates) {
      if (!radar?.id) continue;
      if (radarLocationHints[radar.id] || radarHintRequestRef.current[radar.id]) continue;
      const latitude = Number(radar.latitude);
      const longitude = Number(radar.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      radarHintRequestRef.current[radar.id] = true;
      (async () => {
        try {
          const fullLabel = await GoogleMapsService.getReverseGeocoding(latitude, longitude);
          const shortLabel = extractShortStreetLabel(fullLabel);
          if (!shortLabel) return;
          setRadarLocationHints((prev) => {
            if (prev[radar.id] === shortLabel) return prev;
            return { ...prev, [radar.id]: shortLabel };
          });
        } catch {
          // Ignore reverse geocode failures for non-critical hints.
        } finally {
          delete radarHintRequestRef.current[radar.id];
        }
      })();
    }
  }, [nearbyRadars, radarLocationHints]);

  const nearbyRadarsWithHints = useMemo(
    () =>
      nearbyRadars.map((radar) => ({
        ...radar,
        locationHint: radarLocationHints[radar.id] || radar.locationLabel || '',
      })),
    [nearbyRadars, radarLocationHints]
  );

  useEffect(() => {
    const unsubscribe = useRadarStore.subscribe((state) => {
      const location = state.currentLocation;
      if (
        location &&
        (!currentLocationRef.current ||
          location.latitude !== currentLocationRef.current.latitude ||
          location.longitude !== currentLocationRef.current.longitude)
      ) {
        const previousHeadingLocation = previousHeadingLocationRef.current;
        const headingFromSensor =
          typeof location.heading === 'number' && Number.isFinite(location.heading)
            ? normalizeHeading(location.heading)
            : null;
        const movementMeters = previousHeadingLocation
          ? LocationService.calculateDistanceSync(
              previousHeadingLocation.latitude,
              previousHeadingLocation.longitude,
              location.latitude,
              location.longitude
            ) * 1000
          : 0;
        const bearingHeading =
          headingFromSensor === null && previousHeadingLocation && movementMeters >= 3
            ? calculateBearing(
                previousHeadingLocation.latitude,
                previousHeadingLocation.longitude,
                location.latitude,
                location.longitude
              )
            : null;
        const resolvedHeading = headingFromSensor ?? bearingHeading ?? lastValidHeadingRef.current;
        lastValidHeadingRef.current = normalizeHeading(resolvedHeading);
        previousHeadingLocationRef.current = {
          latitude: location.latitude,
          longitude: location.longitude,
        };

        const previousSmoothed = smoothedLocationRef.current;
        const sampleSpeedKph =
          typeof location.speed === 'number' && Number.isFinite(location.speed) && location.speed >= 0
            ? location.speed * 3.6
            : Math.max(0, currentSpeedRef.current || 0);
        let smoothedLatitude = location.latitude;
        let smoothedLongitude = location.longitude;
        if (previousSmoothed) {
          const baseAlpha =
            sampleSpeedKph >= 90 ? 0.86 : sampleSpeedKph >= 60 ? 0.8 : sampleSpeedKph >= 30 ? 0.72 : 0.6;
          const jumpMeters =
            LocationService.calculateDistanceSync(
              previousSmoothed.latitude,
              previousSmoothed.longitude,
              location.latitude,
              location.longitude
            ) * 1000;
          const spikeAlpha = jumpMeters > 90 && sampleSpeedKph < 35 ? 0.3 : baseAlpha;
          smoothedLatitude =
            previousSmoothed.latitude + (location.latitude - previousSmoothed.latitude) * spikeAlpha;
          smoothedLongitude =
            previousSmoothed.longitude + (location.longitude - previousSmoothed.longitude) * spikeAlpha;
        }
        smoothedLocationRef.current = {
          latitude: smoothedLatitude,
          longitude: smoothedLongitude,
        };

        const locationWithHeading = {
          ...location,
          latitude: smoothedLatitude,
          longitude: smoothedLongitude,
          heading: lastValidHeadingRef.current,
        };

        currentLocationRef.current = locationWithHeading;
        pushLocationSample(locationWithHeading);

        const previousUiLocation = lastUiLocationRef.current;
        const now = Date.now();
        const movedMeters = previousUiLocation
          ? LocationService.calculateDistanceSync(
              previousUiLocation.latitude,
              previousUiLocation.longitude,
              locationWithHeading.latitude,
              locationWithHeading.longitude
            ) * 1000
          : Number.POSITIVE_INFINITY;
        const previousHeading =
          typeof previousUiLocation?.heading === 'number' ? previousUiLocation.heading : null;
        const nextHeading =
          typeof locationWithHeading.heading === 'number' ? locationWithHeading.heading : null;
        let headingDelta = 0;
        if (previousHeading !== null && nextHeading !== null) {
          headingDelta = Math.abs(nextHeading - previousHeading);
          if (headingDelta > 180) headingDelta = 360 - headingDelta;
        }
        const uiUpdateIntervalMs =
          sampleSpeedKph >= 90 ? 220 : sampleSpeedKph >= 60 ? 280 : sampleSpeedKph >= 30 ? 350 : 500;
        const uiMoveThresholdMeters =
          sampleSpeedKph >= 90 ? 1.8 : sampleSpeedKph >= 60 ? 1.4 : sampleSpeedKph >= 30 ? 1.0 : 0.6;
        const shouldUpdateUiLocation =
          !previousUiLocation ||
          movedMeters >= uiMoveThresholdMeters ||
          headingDelta >= 3 ||
          now - lastUiLocationUpdateAtRef.current >= uiUpdateIntervalMs;

        if (shouldUpdateUiLocation && allowUiLocationUpdates) {
          lastUiLocationRef.current = locationWithHeading;
          lastUiLocationUpdateAtRef.current = now;
          setCurrentLocation(locationWithHeading);
        }

        if (isDriving && activeTab === 'Map' && !manualPanModeRef.current && !isTypingRef.current) {
          const lastCameraCenter = lastCameraCenterRef.current;
          const movedFromCameraMeters = lastCameraCenter
            ? LocationService.calculateDistanceSync(
                lastCameraCenter.latitude,
                lastCameraCenter.longitude,
                locationWithHeading.latitude,
                locationWithHeading.longitude
              ) * 1000
            : Number.POSITIVE_INFINITY;
          const currentHeading =
            typeof locationWithHeading.heading === 'number' && Number.isFinite(locationWithHeading.heading)
              ? normalizeHeading(locationWithHeading.heading)
              : lastValidHeadingRef.current;
          const targetHeading = followHeading ? currentHeading : 0;
          const previousCameraHeading = lastCameraHeadingRef.current;
          let cameraHeadingDelta = Number.POSITIVE_INFINITY;
          if (typeof previousCameraHeading === 'number') {
            cameraHeadingDelta = Math.abs(targetHeading - previousCameraHeading);
            if (cameraHeadingDelta > 180) cameraHeadingDelta = 360 - cameraHeadingDelta;
          }

          const cameraUpdateIntervalMs =
            sampleSpeedKph >= 90 ? 180 : sampleSpeedKph >= 60 ? 220 : sampleSpeedKph >= 30 ? 280 : 380;
          const cameraMoveThresholdMeters =
            sampleSpeedKph >= 90 ? 2.4 : sampleSpeedKph >= 60 ? 1.9 : sampleSpeedKph >= 30 ? 1.3 : 0.8;

          const shouldAnimateCamera =
            !lastCameraCenter ||
            movedFromCameraMeters >= cameraMoveThresholdMeters ||
            cameraHeadingDelta >= 3;

          if (shouldAnimateCamera && now - lastCameraUpdateRef.current >= cameraUpdateIntervalMs) {
            const lookAheadMeters = Math.max(
              42,
              Math.min(84, 52 + Math.round((currentSpeedRef.current || 0) * 0.55))
            );
            const followCenter = projectForwardCoordinate(
              locationWithHeading.latitude,
              locationWithHeading.longitude,
              targetHeading,
              lookAheadMeters
            );
            mapRef.current?.animateCamera(
              {
                center: {
                  latitude: followCenter.latitude,
                  longitude: followCenter.longitude,
                },
                pitch: 62,
                heading: targetHeading,
                zoom: 19.12,
              },
              { duration: 260 }
            );
            lastCameraCenterRef.current = {
              latitude: followCenter.latitude,
              longitude: followCenter.longitude,
            };
            lastCameraHeadingRef.current = targetHeading;
            lastCameraUpdateRef.current = now;

            if (MAP_TRACE_ENABLED) {
              console.log('[MapTrace] cameraFollow', {
                movedFromCameraMeters: Math.round(movedFromCameraMeters),
                cameraHeadingDelta: Number.isFinite(cameraHeadingDelta)
                  ? Math.round(cameraHeadingDelta)
                  : 'first',
                targetHeading: Math.round(targetHeading),
              });
            }
          }
        }
      }
    });

    return unsubscribe;
  }, [
    activeTab,
    allowUiLocationUpdates,
    followHeading,
    isDriving,
    manualPanModeRef,
    isTypingRef,
    mapRef,
    pushLocationSample,
  ]);

  useEffect(() => {
    if (currentLocation && mapRef.current && !hasCenteredMapRef.current) {
      const initialHeading =
        followHeading && typeof currentLocation.heading === 'number' && Number.isFinite(currentLocation.heading)
          ? currentLocation.heading
          : 0;
      const initialCenter = followHeading
        ? projectForwardCoordinate(currentLocation.latitude, currentLocation.longitude, initialHeading, 58)
        : { latitude: currentLocation.latitude, longitude: currentLocation.longitude };
      mapRef.current.animateCamera(
        {
          center: initialCenter,
          zoom: 19.02,
          pitch: 61,
          heading: initialHeading,
        },
        { duration: 420 }
      );
      lastCameraCenterRef.current = {
        latitude: initialCenter.latitude,
        longitude: initialCenter.longitude,
      };
      lastCameraHeadingRef.current = initialHeading;
      lastCameraUpdateRef.current = Date.now();
      hasCenteredMapRef.current = true;
    }
  }, [currentLocation, followHeading, hasCenteredMapRef, mapRef]);

  useEffect(() => {
    const fetchNearby = async () => {
      const loc = currentLocationRef.current || (await LocationService.getCurrentLocation());
      if (!loc) return;

      const radars = await RadarService.getNearbyRadars(loc.latitude, loc.longitude, 10);
      const filtered = applyRouteRelevanceFilter(radars, {
        latitude: loc.latitude,
        longitude: loc.longitude,
        heading: typeof loc.heading === 'number' ? loc.heading : null,
      });
      updateNearbyRadarsState(filtered);
    };

    fetchNearby();
    const interval = setInterval(fetchNearby, 15000);
    return () => clearInterval(interval);
  }, [applyRouteRelevanceFilter, updateNearbyRadarsState]);

  return {
    currentLocation,
    setCurrentLocation,
    currentLocationRef,
    nearbyRadars: nearbyRadarsWithHints,
    nearbyRadarsRef,
    setNearbyRadars,
    updateNearbyRadarsState,
    currentSpeed,
    resetSpeed,
    activeAlert,
    closestRadar,
    closestRadarHint,
    resolvedHeading:
      typeof currentLocation?.heading === 'number' && Number.isFinite(currentLocation.heading)
        ? normalizeHeading(currentLocation.heading)
        : lastValidHeadingRef.current,
  };
}
