import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView from 'react-native-maps';
import * as Speech from 'expo-speech';
import { AddressSuggestion } from '../../../types';
import { AdService } from '../../../services/AdService';
import { GoogleMapsService } from '../../../services/GoogleMapsService';
import { LocationService } from '../../../services/LocationService';
import { RadarService } from '../../../services/RadarService';
import { RECENT_DESTINATIONS_KEY } from '../constants';
import { NavStep, RouteMeta, TabType } from '../types';
import { isHighwayManeuver, stripHtml } from '../utils/radarFormatters';

type UseRadarNavigationParams = {
  canUsePro: boolean;
  mapRef: React.RefObject<MapView | null>;
  hasCenteredMapRef: React.MutableRefObject<boolean>;
  currentLocation: any;
  setCurrentLocation: (location: any) => void;
  currentLocationRef: React.MutableRefObject<any>;
  isDriving: boolean;
  setTotalDistance: React.Dispatch<React.SetStateAction<number>>;
  lastPositionRef: React.MutableRefObject<any>;
  startDrivingSession: (params: {
    setActiveTab: (tab: TabType) => void;
    activateMapTab?: boolean;
    source?: 'manual' | 'navigate' | 'force_tab';
  }) => Promise<void>;
  saveTripIfNeeded: () => Promise<void>;
  resetDrivingSession: () => void;
  setActiveTab: (tab: TabType) => void;
  resetSpeed: () => void;
  setNearbyRadars: React.Dispatch<React.SetStateAction<any[]>>;
  updateNearbyRadarsState: (incoming: any[]) => void;
  dismissDestinationInput: (onDismissFinalize?: () => void) => void;
  setDestinationInputFocused: (focused: boolean) => void;
  isTypingRef: React.MutableRefObject<boolean>;
  getCurrentSpeedKph: () => number;
  logRouteSteps: (payload: { destination: string; points: number; steps: NavStep[] }) => void;
};

export function useRadarNavigation({
  canUsePro,
  mapRef,
  hasCenteredMapRef,
  currentLocation,
  setCurrentLocation,
  currentLocationRef,
  isDriving,
  setTotalDistance,
  lastPositionRef,
  startDrivingSession,
  saveTripIfNeeded,
  resetDrivingSession,
  setActiveTab,
  resetSpeed,
  setNearbyRadars,
  updateNearbyRadarsState,
  dismissDestinationInput,
  setDestinationInputFocused,
  isTypingRef,
  getCurrentSpeedKph,
  logRouteSteps,
}: UseRadarNavigationParams) {
  const [destination, setDestination] = useState('');
  const [routeCoords, setRouteCoords] = useState<any[]>([]);
  const [routeMeta, setRouteMeta] = useState<RouteMeta | null>(null);
  const [destinationCoord, setDestinationCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [recentDestinations, setRecentDestinations] = useState<AddressSuggestion[]>([]);
  const [arrivalState, setArrivalState] = useState<'none' | 'approaching' | 'arrived'>('none');
  const [distanceToDestinationMeters, setDistanceToDestinationMeters] = useState<number | null>(null);
  const [hasArrived, setHasArrived] = useState(false);

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchRequestIdRef = useRef(0);
  const searchCountryCodeRef = useRef<string | undefined>(undefined);
  const rerouteConsecutiveOffRouteRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const stepDistanceHistoryRef = useRef<Record<number, { lastDistanceMeters: number; increasingTicks: number }>>({});
  const announcedTurnCueRef = useRef<Record<string, boolean>>({});
  const stepRouteProgressRef = useRef<number[]>([]);
  const navRefreshInFlightRef = useRef(false);
  const destinationCloseTickRef = useRef(0);
  const hasArrivalAnnouncementRef = useRef(false);
  const hasArrivedRef = useRef(false);

  useEffect(() => {
    hasArrivedRef.current = hasArrived;
  }, [hasArrived]);

  const toRecentSuggestion = useCallback((item: any): AddressSuggestion | null => {
    if (typeof item === 'string') {
      const label = item.trim();
      if (!label) return null;
      return {
        id: `recent:${label.toLowerCase()}`,
        label,
        queryValue: label,
        latitude: Number.NaN,
        longitude: Number.NaN,
        source: 'recent',
        qualityScore: 20,
      };
    }
    if (!item || typeof item !== 'object') return null;
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) return null;
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    const queryValue =
      typeof item.queryValue === 'string' && item.queryValue.trim().length > 0
        ? item.queryValue
        : Number.isFinite(latitude) && Number.isFinite(longitude)
          ? `${latitude},${longitude}`
          : label;
    return {
      id: typeof item.id === 'string' ? item.id : `recent:${label.toLowerCase()}`,
      label,
      queryValue,
      latitude,
      longitude,
      source: 'recent',
      qualityScore: Number(item.qualityScore) || 30,
    };
  }, []);

  const persistRecentDestination = useCallback(async (suggestion: AddressSuggestion) => {
    const cleanedLabel = suggestion.label.trim();
    if (!cleanedLabel) return;

    const normalized: AddressSuggestion = {
      ...suggestion,
      id: suggestion.id || `recent:${cleanedLabel.toLowerCase()}`,
      label: cleanedLabel,
      queryValue:
        suggestion.queryValue ||
        (Number.isFinite(suggestion.latitude) && Number.isFinite(suggestion.longitude)
          ? `${suggestion.latitude},${suggestion.longitude}`
          : cleanedLabel),
      source: 'recent',
      qualityScore: Math.max(40, suggestion.qualityScore || 0),
    };

    setRecentDestinations((prev) => {
      const deduped = [
        normalized,
        ...prev.filter(
          (item) =>
            item.label.toLowerCase() !== normalized.label.toLowerCase() &&
            item.queryValue !== normalized.queryValue
        ),
      ];
      const next = deduped.slice(0, 8);
      const serializable = next.map((item) => ({
        id: item.id,
        label: item.label,
        queryValue: item.queryValue,
        latitude: item.latitude,
        longitude: item.longitude,
        qualityScore: item.qualityScore,
      }));
      AsyncStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(serializable)).catch(() => {});
      return next;
    });
  }, []);

  const mergeSuggestions = useCallback(
    (primary: AddressSuggestion[], secondary: AddressSuggestion[] = []) => {
      const merged = new Map<string, AddressSuggestion>();
      for (const item of [...primary, ...secondary]) {
        const key = `${item.queryValue}|${item.label.toLowerCase()}`;
        const existing = merged.get(key);
        if (!existing || item.qualityScore > existing.qualityScore) {
          merged.set(key, item);
        }
      }
      return Array.from(merged.values())
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, 6);
    },
    []
  );

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(RECENT_DESTINATIONS_KEY)
      .then((raw) => {
        if (!isMounted) return;
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map((item) => toRecentSuggestion(item))
            .filter((item): item is AddressSuggestion => Boolean(item))
            .slice(0, 8);
          setRecentDestinations(normalized);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [toRecentSuggestion]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const envCountryCode = process.env.EXPO_PUBLIC_DEFAULT_COUNTRY_CODE?.trim().toLowerCase();
    if (envCountryCode && /^[a-z]{2}$/.test(envCountryCode)) {
      searchCountryCodeRef.current = envCountryCode;
      return;
    }
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const localeCountry = locale.split('-')[1]?.toLowerCase();
    if (localeCountry && /^[a-z]{2}$/.test(localeCountry)) {
      searchCountryCodeRef.current = localeCountry;
      return;
    }
    searchCountryCodeRef.current = 'us';
  }, []);

  const handleTextChange = useCallback(
    (text: string) => {
      setDestination(text);

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      const query = text.trim().toLowerCase();
      if (!query) {
        setSuggestions([]);
        searchRequestIdRef.current += 1;
        return;
      }

      const localMatches = recentDestinations
        .filter((item) => item.label.toLowerCase().includes(query))
        .map((item) => ({ ...item, qualityScore: Math.max(item.qualityScore, 45) }))
        .slice(0, 6);
      setSuggestions(localMatches);

      if (query.length < 2) return;

      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;

      searchTimerRef.current = setTimeout(async () => {
        const focusLocation = currentLocationRef.current || currentLocation;
        const results = await GoogleMapsService.getGeocodeSuggestions(text, {
          countryCode: searchCountryCodeRef.current,
          focusLocation: focusLocation
            ? {
                latitude: focusLocation.latitude,
                longitude: focusLocation.longitude,
              }
            : undefined,
        });
        if (requestId !== searchRequestIdRef.current) return;
        if (results.length > 0) {
          setSuggestions(mergeSuggestions(results, localMatches));
        }
      }, 600);
    },
    [currentLocation, currentLocationRef, mergeSuggestions, recentDestinations]
  );

  const handleNavigate = useCallback(
    async (targetDest?: string, params?: { destinationLabel?: string; destinationCoord?: { latitude: number; longitude: number } }) => {
      if (!canUsePro && AdService.shouldShowAds()) {
        await AdService.showInterstitial();
      }
      const finalDest = (targetDest || destination).trim();
      if (!finalDest) {
        console.warn('No destination provided');
        return;
      }
      setRouteMeta(null);
      setDestinationCoord(params?.destinationCoord || null);
      rerouteConsecutiveOffRouteRef.current = 0;
      destinationCloseTickRef.current = 0;
      hasArrivalAnnouncementRef.current = false;
      hasArrivedRef.current = false;
      setArrivalState('none');
      setDistanceToDestinationMeters(null);
      setHasArrived(false);

      try {
        dismissDestinationInput(() => {
          isTypingRef.current = false;
          searchRequestIdRef.current += 1;
          setSuggestions([]);
        });

        let loc = currentLocationRef.current || currentLocation;
        if (!loc) {
          try {
            loc = await LocationService.getCurrentLocation();
            if (loc) {
              setCurrentLocation(loc);
              currentLocationRef.current = loc;
            }
          } catch (error) {
            console.error('Failed to get current location:', error);
            alert('Unable to get your location. Please enable location services and try again.');
            return;
          }
        }

        if (!loc) {
          alert('Location unavailable. Please enable location services.');
          return;
        }

        const res = await GoogleMapsService.getDirections(loc.latitude, loc.longitude, finalDest, {
          alternatives: true,
          prefer: 'duration',
        });

        if (!res || res?.error) {
          alert(res?.message || 'Unable to get directions. Please try again.');
          return;
        }

        if (!res?.coordinates?.length) {
          alert('Unable to find route. Please check the destination and try again.');
          return;
        }

        setRouteCoords(res.coordinates);
        const primaryLeg = res?.legs?.[0];
        const resolvedDestinationLabel = primaryLeg?.end_address || params?.destinationLabel || finalDest;
        const resolvedDestinationCoord =
          primaryLeg?.end_location?.lat && primaryLeg?.end_location?.lng
            ? {
                latitude: primaryLeg.end_location.lat,
                longitude: primaryLeg.end_location.lng,
              }
            : params?.destinationCoord || null;

        if (primaryLeg) {
          setRouteMeta({
            etaText: primaryLeg.duration?.text || 'ETA —',
            distanceText: primaryLeg.distance?.text || 'Distance —',
            destinationLabel: resolvedDestinationLabel,
          });
        } else {
          setRouteMeta(null);
        }
        setDestinationCoord(resolvedDestinationCoord);

        await persistRecentDestination({
          id: `recent:${resolvedDestinationLabel.toLowerCase()}`,
          label: resolvedDestinationLabel,
          queryValue:
            resolvedDestinationCoord &&
            Number.isFinite(resolvedDestinationCoord.latitude) &&
            Number.isFinite(resolvedDestinationCoord.longitude)
              ? `${resolvedDestinationCoord.latitude},${resolvedDestinationCoord.longitude}`
              : finalDest,
          latitude: resolvedDestinationCoord?.latitude ?? Number.NaN,
          longitude: resolvedDestinationCoord?.longitude ?? Number.NaN,
          source: 'recent',
          qualityScore: 60,
        });

        await startDrivingSession({ setActiveTab, activateMapTab: true, source: 'navigate' });
        const steps = primaryLeg?.steps || [];
        const parsedSteps: NavStep[] = steps.map((step: any) => ({
          instruction: stripHtml(step.html_instructions || step.instructions || ''),
          distanceMeters: step.distance?.value ?? null,
          maneuver: step.maneuver,
          endLocation: step.end_location
            ? { latitude: step.end_location.lat, longitude: step.end_location.lng }
            : undefined,
        }));
        logRouteSteps({
          destination: resolvedDestinationLabel,
          points: res.coordinates.length,
          steps: parsedSteps,
        });
        setNavSteps(parsedSteps);
        setCurrentStepIndex(0);
        stepDistanceHistoryRef.current = {};

        const rawRouteRadars = await RadarService.getRadarsAlongRoute(res.coordinates);
        const routeRadarsWithDist = await Promise.all(
          rawRouteRadars.map(async (radar) => {
            const distance = await LocationService.calculateDistance(
              loc.latitude,
              loc.longitude,
              radar.latitude,
              radar.longitude
            );
            return { ...radar, distance };
          })
        );

        setNearbyRadars(routeRadarsWithDist.sort((a, b) => a.distance - b.distance));
        setSuggestions([]);

        const fallbackHeading =
          res.coordinates.length > 1
            ? LocationService.calculateBearing(
                res.coordinates[0].latitude,
                res.coordinates[0].longitude,
                res.coordinates[1].latitude,
                res.coordinates[1].longitude
              )
            : 0;
        const tightFollowHeading =
          typeof loc.heading === 'number' && Number.isFinite(loc.heading) ? loc.heading : fallbackHeading;
        mapRef.current?.animateCamera(
          {
            center: {
              latitude: loc.latitude,
              longitude: loc.longitude,
            },
            zoom: 18.2,
            pitch: 64,
            heading: tightFollowHeading,
          },
          { duration: 650 }
        );
        hasCenteredMapRef.current = true;
      } catch (error) {
        console.error('Navigation failed:', error);
        alert('Route could not be created. Check your connection and try again.');
      }
    },
    [
      canUsePro,
      currentLocation,
      currentLocationRef,
      destination,
      dismissDestinationInput,
      hasCenteredMapRef,
      isTypingRef,
      logRouteSteps,
      mapRef,
      persistRecentDestination,
      setActiveTab,
      setCurrentLocation,
      setNearbyRadars,
      startDrivingSession,
    ]
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: AddressSuggestion) => {
      const navigateTarget = suggestion.queryValue || suggestion.label;
      setDestination(suggestion.label);
      setSuggestions([]);
      persistRecentDestination(suggestion);
      handleNavigate(navigateTarget, {
        destinationLabel: suggestion.label,
        destinationCoord:
          Number.isFinite(suggestion.latitude) && Number.isFinite(suggestion.longitude)
            ? { latitude: suggestion.latitude, longitude: suggestion.longitude }
            : undefined,
      });
    },
    [handleNavigate, persistRecentDestination]
  );

  const getStepDistanceMeters = useCallback(
    (step?: NavStep) => {
      if (!step) return null;
      const loc = currentLocationRef.current || currentLocation;
      if (loc && step.endLocation) {
        const distanceKm = LocationService.calculateDistanceSync(
          loc.latitude,
          loc.longitude,
          step.endLocation.latitude,
          step.endLocation.longitude
        );
        return distanceKm * 1000;
      }
      return step.distanceMeters;
    },
    [currentLocation, currentLocationRef]
  );

  const resolveStepIndexFromLocation = useCallback(
    (loc: { latitude: number; longitude: number } | null | undefined, steps: NavStep[], fallbackIndex: number) => {
      if (!loc || steps.length === 0) return fallbackIndex;
      const clampedFallback = Math.max(0, Math.min(fallbackIndex, steps.length - 1));
      const searchStart = Math.max(0, clampedFallback - 1);
      const searchEnd = Math.min(steps.length - 1, clampedFallback + 6);

      let bestIndex = clampedFallback;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let index = searchStart; index <= searchEnd; index += 1) {
        const candidate = steps[index];
        if (!candidate?.endLocation) continue;
        const distanceMeters =
          LocationService.calculateDistanceSync(
            loc.latitude,
            loc.longitude,
            candidate.endLocation.latitude,
            candidate.endLocation.longitude
          ) * 1000;

        if (distanceMeters < bestDistance) {
          bestDistance = distanceMeters;
          bestIndex = index;
        }
      }

      if (!Number.isFinite(bestDistance)) return clampedFallback;

      if (bestDistance <= 45) {
        return Math.min(bestIndex + 1, steps.length - 1);
      }

      if (bestIndex > clampedFallback && bestDistance <= 170) {
        return bestIndex;
      }

      return clampedFallback;
    },
    []
  );

  const updateStepRouteProgress = useCallback(
    (steps: NavStep[], coords: Array<{ latitude: number; longitude: number }>) => {
      if (!steps.length || !coords.length) {
        stepRouteProgressRef.current = [];
        return;
      }
      const nextProgress: number[] = [];
      let searchStart = 0;
      const toMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) =>
        LocationService.calculateDistanceSync(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;

      for (const step of steps) {
        if (!step.endLocation) {
          nextProgress.push(searchStart);
          continue;
        }
        let bestIndex = searchStart;
        let bestDistance = Number.POSITIVE_INFINITY;
        const maxIndex = coords.length - 1;
        const windowEnd = Math.min(maxIndex, searchStart + 160);
        for (let index = searchStart; index <= windowEnd; index += 1) {
          const distance = toMeters(step.endLocation, coords[index]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
            if (distance < 12) break;
          }
        }
        nextProgress.push(bestIndex);
        searchStart = bestIndex;
      }
      stepRouteProgressRef.current = nextProgress;
    },
    []
  );

  const resetRoute = useCallback(async () => {
    try {
      await saveTripIfNeeded();
    } catch (error) {}

    setDestination('');
    setSuggestions([]);
    setRouteCoords([]);
    setRouteMeta(null);
    setDestinationCoord(null);
    setNavSteps([]);
    setCurrentStepIndex(0);
    stepDistanceHistoryRef.current = {};
    announcedTurnCueRef.current = {};
    stepRouteProgressRef.current = [];
    rerouteConsecutiveOffRouteRef.current = 0;
    lastRerouteAtRef.current = 0;
    navRefreshInFlightRef.current = false;
    destinationCloseTickRef.current = 0;
    hasArrivalAnnouncementRef.current = false;
    hasArrivedRef.current = false;
    setArrivalState('none');
    setDistanceToDestinationMeters(null);
    setHasArrived(false);
    setTotalDistance(0);
    lastPositionRef.current = null;
    resetSpeed();
    resetDrivingSession();
    setActiveTab('Basic');
    setNearbyRadars([]);
    setDestinationInputFocused(false);
    isTypingRef.current = false;

    if (currentLocation) {
      RadarService.getNearbyRadars(currentLocation.latitude, currentLocation.longitude, 10).then(
        updateNearbyRadarsState
      );
    }
  }, [
    currentLocation,
    isTypingRef,
    lastPositionRef,
    resetDrivingSession,
    resetSpeed,
    saveTripIfNeeded,
    setActiveTab,
    setDestinationInputFocused,
    setNearbyRadars,
    setTotalDistance,
    updateNearbyRadarsState,
    updateStepRouteProgress,
  ]);

  useEffect(() => {
    updateStepRouteProgress(navSteps, routeCoords);
  }, [navSteps, routeCoords, updateStepRouteProgress]);

  useEffect(() => {
    if (!isDriving) return;

    const computeRouteProximityMeters = (loc: { latitude: number; longitude: number }) => {
      if (!routeCoords.length) return Number.POSITIVE_INFINITY;
      let minDistance = Number.POSITIVE_INFINITY;
      const cosLat = Math.max(0.2, Math.cos((loc.latitude * Math.PI) / 180));
      for (const coord of routeCoords) {
        const dLat = (coord.latitude - loc.latitude) * 111000;
        const dLng = (coord.longitude - loc.longitude) * 111000 * cosLat;
        const distance = Math.sqrt(dLat * dLat + dLng * dLng);
        if (distance < minDistance) minDistance = distance;
        if (minDistance < 18) break;
      }
      return minDistance;
    };

    const scheduler = setInterval(async () => {
      const loc = currentLocationRef.current;
      if (!loc) return;

      if (lastPositionRef.current) {
        const movedKm = LocationService.calculateDistanceSync(
          loc.latitude,
          loc.longitude,
          lastPositionRef.current.latitude,
          lastPositionRef.current.longitude
        );
        if (movedKm > 0.005) {
          setTotalDistance((prev) => prev + movedKm);
          lastPositionRef.current = loc;
        }
      } else {
        lastPositionRef.current = loc;
      }

      let nextStepIndex = currentStepIndex;
      const currentStep = navSteps[currentStepIndex];
      if (currentStep?.endLocation && currentStepIndex < navSteps.length - 1) {
        const distanceMeters =
          LocationService.calculateDistanceSync(
            loc.latitude,
            loc.longitude,
            currentStep.endLocation.latitude,
            currentStep.endLocation.longitude
          ) * 1000;
        const thresholdBase = isHighwayManeuver(currentStep) ? 90 : 55;
        const thresholdByStepLength = currentStep.distanceMeters
          ? Math.max(30, Math.min(isHighwayManeuver(currentStep) ? 120 : 70, currentStep.distanceMeters * 0.35))
          : thresholdBase;
        const threshold = Math.max(thresholdBase, thresholdByStepLength);
        const previous = stepDistanceHistoryRef.current[currentStepIndex];
        const increasingTicks =
          previous && distanceMeters > previous.lastDistanceMeters + 6
            ? previous.increasingTicks + 1
            : 0;

        stepDistanceHistoryRef.current[currentStepIndex] = {
          lastDistanceMeters: distanceMeters,
          increasingTicks,
        };

        if (distanceMeters <= threshold || (distanceMeters <= threshold + 35 && increasingTicks >= 2)) {
          nextStepIndex = Math.min(currentStepIndex + 1, navSteps.length - 1);
        }
      }

      nextStepIndex = resolveStepIndexFromLocation(loc, navSteps, nextStepIndex);
      const routeProgressMarks = stepRouteProgressRef.current;
      if (routeCoords.length > 0 && routeProgressMarks.length > 0) {
        let currentRouteIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        const cosLat = Math.max(0.2, Math.cos((loc.latitude * Math.PI) / 180));
        for (let i = 0; i < routeCoords.length; i += 1) {
          const coord = routeCoords[i];
          const dLat = (coord.latitude - loc.latitude) * 111000;
          const dLng = (coord.longitude - loc.longitude) * 111000 * cosLat;
          const d = Math.sqrt(dLat * dLat + dLng * dLng);
          if (d < bestDistance) {
            bestDistance = d;
            currentRouteIndex = i;
            if (d < 8) break;
          }
        }
        while (
          nextStepIndex < routeProgressMarks.length - 1 &&
          currentRouteIndex >= Math.max(0, (routeProgressMarks[nextStepIndex] || 0) - 2)
        ) {
          nextStepIndex += 1;
        }
      }
      if (nextStepIndex !== currentStepIndex) {
        setCurrentStepIndex(nextStepIndex);
      }

      const stepForCue = navSteps[nextStepIndex];
      if (stepForCue?.endLocation) {
        const stepDistanceMeters =
          LocationService.calculateDistanceSync(
            loc.latitude,
            loc.longitude,
            stepForCue.endLocation.latitude,
            stepForCue.endLocation.longitude
          ) * 1000;
        const cueThresholds = [500, 200, 80];
        for (const threshold of cueThresholds) {
          const cueKey = `${nextStepIndex}:${threshold}`;
          if (!announcedTurnCueRef.current[cueKey] && stepDistanceMeters <= threshold) {
            const instruction = stepForCue.instruction || 'follow the route';
            const spokenText =
              threshold <= 80
                ? `Now, ${instruction}.`
                : `In ${Math.max(20, Math.round(stepDistanceMeters))} meters, ${instruction}.`;
            Speech.stop();
            Speech.speak(spokenText, {
              language: 'en-US',
              rate: 0.95,
              pitch: 1,
            });
            announcedTurnCueRef.current[cueKey] = true;
          }
        }
      }

      const finalDestination =
        destinationCoord ||
        (routeCoords.length > 0 ? routeCoords[routeCoords.length - 1] : null);
      if (
        finalDestination &&
        Number.isFinite(finalDestination.latitude) &&
        Number.isFinite(finalDestination.longitude)
      ) {
        const distanceToDestination =
          LocationService.calculateDistanceSync(
            loc.latitude,
            loc.longitude,
            finalDestination.latitude,
            finalDestination.longitude
          ) * 1000;
        setDistanceToDestinationMeters(distanceToDestination);

        if (!hasArrivedRef.current) {
          if (distanceToDestination <= 25) {
            destinationCloseTickRef.current += 1;
          } else {
            destinationCloseTickRef.current = 0;
          }

          const currentSpeedKph = Math.max(0, getCurrentSpeedKph() || 0);
          const arrivedByCloseTicks =
            distanceToDestination <= 25 && destinationCloseTickRef.current >= 2;
          const arrivedByLowSpeed = distanceToDestination <= 35 && currentSpeedKph < 3;

          if (arrivedByCloseTicks || arrivedByLowSpeed) {
            hasArrivedRef.current = true;
            setHasArrived(true);
            setArrivalState('arrived');
            rerouteConsecutiveOffRouteRef.current = 0;

            if (!hasArrivalAnnouncementRef.current) {
              hasArrivalAnnouncementRef.current = true;
              Speech.stop();
              Speech.speak('You have arrived.', {
                language: 'en-US',
                rate: 0.95,
                pitch: 1,
              });
            }
          } else if (distanceToDestination <= 150) {
            setArrivalState('approaching');
          } else {
            setArrivalState('none');
          }
        } else {
          setArrivalState('arrived');
        }
      } else {
        setDistanceToDestinationMeters(null);
        if (!hasArrivedRef.current) {
          setArrivalState('none');
        }
      }

      if (!routeCoords.length || !destination) return;
      if (hasArrivedRef.current) return;
      const distanceToRoute = computeRouteProximityMeters(loc);
      if (distanceToRoute > 60) {
        rerouteConsecutiveOffRouteRef.current = Math.max(
          rerouteConsecutiveOffRouteRef.current,
          3
        );
      } else if (distanceToRoute > 35) {
        rerouteConsecutiveOffRouteRef.current += 1;
      } else if (distanceToRoute < 22) {
        rerouteConsecutiveOffRouteRef.current = 0;
      }

      const now = Date.now();
      const shouldReroute =
        rerouteConsecutiveOffRouteRef.current >= 3 &&
        now - lastRerouteAtRef.current > 4500 &&
        !navRefreshInFlightRef.current;
      if (!shouldReroute) return;

      navRefreshInFlightRef.current = true;
      lastRerouteAtRef.current = now;
      try {
        const previousDestination = destinationCoord;
        const reroute = await GoogleMapsService.recalculateRoute(loc.latitude, loc.longitude, destination, {
          legs: [
            {
              distance: routeMeta?.distanceText,
              duration: routeMeta?.etaText,
              end_address: routeMeta?.destinationLabel,
              steps: navSteps,
              end_location: destinationCoord,
              start_location: currentLocation,
            },
          ],
          coordinates: routeCoords,
        });
        if (reroute?.error || !reroute?.coordinates?.length) return;

        setRouteCoords(reroute.coordinates);

        const leg = reroute?.legs?.[0];
        if (leg) {
          setRouteMeta({
            etaText: leg.duration?.text || routeMeta?.etaText || 'ETA —',
            distanceText: leg.distance?.text || routeMeta?.distanceText || 'Distance —',
            destinationLabel: leg.end_address || routeMeta?.destinationLabel || destination,
          });
          if (leg.end_location?.lat && leg.end_location?.lng) {
            setDestinationCoord({ latitude: leg.end_location.lat, longitude: leg.end_location.lng });
          } else if (previousDestination) {
            setDestinationCoord(previousDestination);
          }
        }

        const parsedSteps: NavStep[] = (leg?.steps || []).map((step: any) => ({
          instruction: stripHtml(step.html_instructions || step.instructions || ''),
          distanceMeters: step.distance?.value ?? null,
          maneuver: step.maneuver,
          endLocation: step.end_location
            ? { latitude: step.end_location.lat, longitude: step.end_location.lng }
            : undefined,
        }));
        if (parsedSteps.length > 0) {
          setNavSteps(parsedSteps);
          const safeIndex = resolveStepIndexFromLocation(loc, parsedSteps, 0);
          setCurrentStepIndex(safeIndex);
          stepDistanceHistoryRef.current = {};
          announcedTurnCueRef.current = {};
          updateStepRouteProgress(parsedSteps, reroute.coordinates || routeCoords);
        }
      } catch (error) {
        console.error('[RadarScreen] Reroute scheduler failed:', error);
      } finally {
        navRefreshInFlightRef.current = false;
      }
    }, 1600);

    return () => clearInterval(scheduler);
  }, [
    currentLocation,
    currentLocationRef,
    currentStepIndex,
    destination,
    destinationCoord,
    isDriving,
    lastPositionRef,
    navSteps,
    routeCoords,
    routeMeta,
    setTotalDistance,
    getCurrentSpeedKph,
    resolveStepIndexFromLocation,
    updateStepRouteProgress,
  ]);

  return {
    destination,
    setDestination,
    routeCoords,
    setRouteCoords,
    routeMeta,
    setRouteMeta,
    destinationCoord,
    setDestinationCoord,
    navSteps,
    setNavSteps,
    currentStepIndex,
    setCurrentStepIndex,
    suggestions,
    setSuggestions,
    recentDestinations,
    arrivalState,
    distanceToDestinationMeters,
    hasArrived,
    handleTextChange,
    handleNavigate,
    handleSelectSuggestion,
    getStepDistanceMeters,
    resetRoute,
    rerouteConsecutiveOffRouteRef,
    lastRerouteAtRef,
    stepDistanceHistoryRef,
    navRefreshInFlightRef,
  };
}
