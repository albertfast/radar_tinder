import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { RadarAlert } from '../../../types';
import { useRadarStore } from '../../../store/radarStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { RadarService } from '../../../services/RadarService';
import { LocationService } from '../../../services/LocationService';
import { GoogleMapsService } from '../../../services/GoogleMapsService';
import { NotificationService } from '../../../services/NotificationService';
import { formatDistance } from '../../../utils/format';
import { useSpeedSmoothing } from './useSpeedSmoothing';
import { MAP_TRACE_ENABLED } from '../constants';
import { TabType } from '../types';
import { extractShortStreetLabel, formatRadarLabel } from '../utils/radarFormatters';

type UseRadarDataSyncParams = {
  currentLocation: any;
  setCurrentLocation: (location: any) => void;
  currentLocationRef: React.MutableRefObject<any>;
  mapRef: React.RefObject<MapView | null>;
  isDriving: boolean;
  activeTab: TabType;
  followHeading: boolean;
  isTypingRef: React.MutableRefObject<boolean>;
  isInteractingRef: React.MutableRefObject<boolean>;
  hasCenteredMapRef: React.MutableRefObject<boolean>;
  activeAlerts: RadarAlert[];
  hasHydrated: boolean;
  hapticAlertsEnabled: boolean;
  voicePlaybackEnabled: boolean;
  warningVolume: number;
  unitSystem: 'metric' | 'imperial';
  setRadarLocations: (radars: any[]) => void;
};

export function useRadarDataSync({
  currentLocation,
  setCurrentLocation,
  currentLocationRef,
  mapRef,
  isDriving,
  activeTab,
  followHeading,
  isTypingRef,
  isInteractingRef,
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

  const { uiSpeedKph: currentSpeed, pushLocationSample, resetSpeed } = useSpeedSmoothing({
    calculateDistanceSync: LocationService.calculateDistanceSync,
  });

  const nearbyRadarsRef = useRef<any[]>([]);
  const lastCameraUpdateRef = useRef(0);
  const lastCameraCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastCameraHeadingRef = useRef<number | null>(null);
  const lastUiLocationRef = useRef<any>(null);
  const lastUiLocationUpdateAtRef = useRef(0);
  const lastAnnouncedAlertIdRef = useRef<string | null>(null);
  const closestRadarLabelCacheRef = useRef<Record<string, string>>({});
  const closestRadarLabelRequestRef = useRef<Record<string, boolean>>({});

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
      Speech.stop();
      Speech.speak(message, {
        language: 'en-US',
        pitch: 1,
        rate: 0.95,
        volume: warningVolume / 100,
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
      NotificationService.silenceAllAudioNow().catch(() => {
        Speech.stop();
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
      } catch (error) {
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
    const unsubscribe = useRadarStore.subscribe((state) => {
      const location = state.currentLocation;
      if (
        location &&
        (!currentLocationRef.current ||
          location.latitude !== currentLocationRef.current.latitude ||
          location.longitude !== currentLocationRef.current.longitude)
      ) {
        currentLocationRef.current = location;
        pushLocationSample(location);

        const previousUiLocation = lastUiLocationRef.current;
        const now = Date.now();
        const movedMeters = previousUiLocation
          ? LocationService.calculateDistanceSync(
              previousUiLocation.latitude,
              previousUiLocation.longitude,
              location.latitude,
              location.longitude
            ) * 1000
          : Number.POSITIVE_INFINITY;
        const previousHeading =
          typeof previousUiLocation?.heading === 'number' ? previousUiLocation.heading : null;
        const nextHeading = typeof location.heading === 'number' ? location.heading : null;
        let headingDelta = 0;
        if (previousHeading !== null && nextHeading !== null) {
          headingDelta = Math.abs(nextHeading - previousHeading);
          if (headingDelta > 180) headingDelta = 360 - headingDelta;
        }
        const shouldUpdateUiLocation =
          !previousUiLocation || movedMeters >= 4 || headingDelta >= 10 || now - lastUiLocationUpdateAtRef.current >= 900;

        if (shouldUpdateUiLocation) {
          lastUiLocationRef.current = location;
          lastUiLocationUpdateAtRef.current = now;
          setCurrentLocation(location);
        }

        if (isDriving && activeTab === 'Map' && !isInteractingRef.current && !isTypingRef.current) {
          const lastCameraCenter = lastCameraCenterRef.current;
          const movedFromCameraMeters = lastCameraCenter
            ? LocationService.calculateDistanceSync(
                lastCameraCenter.latitude,
                lastCameraCenter.longitude,
                location.latitude,
                location.longitude
              ) * 1000
            : Number.POSITIVE_INFINITY;
          const rawHeading =
            typeof location.heading === 'number' && Number.isFinite(location.heading)
              ? location.heading
              : 0;
          const targetHeading = followHeading ? rawHeading : 0;
          const previousCameraHeading = lastCameraHeadingRef.current;
          let cameraHeadingDelta = Number.POSITIVE_INFINITY;
          if (typeof previousCameraHeading === 'number') {
            cameraHeadingDelta = Math.abs(targetHeading - previousCameraHeading);
            if (cameraHeadingDelta > 180) cameraHeadingDelta = 360 - cameraHeadingDelta;
          }

          const shouldAnimateCamera =
            !lastCameraCenter ||
            movedFromCameraMeters >= 8 ||
            cameraHeadingDelta >= 10;

          if (shouldAnimateCamera && now - lastCameraUpdateRef.current >= 1500) {
            mapRef.current?.animateCamera(
              {
                center: { latitude: location.latitude, longitude: location.longitude },
                pitch: 50,
                heading: targetHeading,
                altitude: 800,
                zoom: 17,
              },
              { duration: 1200 }
            );
            lastCameraCenterRef.current = { latitude: location.latitude, longitude: location.longitude };
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
  }, [activeTab, followHeading, isDriving, isInteractingRef, isTypingRef, mapRef, pushLocationSample]);

  useEffect(() => {
    if (currentLocation && mapRef.current && !hasCenteredMapRef.current) {
      const initialHeading =
        followHeading && typeof currentLocation.heading === 'number' && Number.isFinite(currentLocation.heading)
          ? currentLocation.heading
          : 0;
      mapRef.current.animateCamera(
        {
          center: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
          zoom: 15,
          pitch: 45,
          heading: initialHeading,
        },
        { duration: 800 }
      );
      lastCameraCenterRef.current = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      };
      lastCameraHeadingRef.current = initialHeading;
      lastCameraUpdateRef.current = Date.now();
      hasCenteredMapRef.current = true;
    }
  }, [currentLocation, followHeading, hasCenteredMapRef, mapRef]);

  useEffect(() => {
    const fetchNearby = async () => {
      const loc = currentLocationRef.current || (await LocationService.getCurrentLocation());
      if (loc) {
        const radars = await RadarService.getNearbyRadars(loc.latitude, loc.longitude, 10);
        updateNearbyRadarsState(radars);
      }
    };
    fetchNearby();
    const interval = setInterval(fetchNearby, 15000);
    return () => clearInterval(interval);
  }, [updateNearbyRadarsState]);

  return {
    currentLocation,
    setCurrentLocation,
    currentLocationRef,
    nearbyRadars,
    nearbyRadarsRef,
    setNearbyRadars,
    updateNearbyRadarsState,
    currentSpeed,
    resetSpeed,
    activeAlert,
    closestRadar,
    closestRadarHint,
  };
}
