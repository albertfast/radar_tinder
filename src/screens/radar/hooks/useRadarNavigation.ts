import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView from 'react-native-maps';
import { AddressSuggestion } from '../../../types';
import { AdService } from '../../../services/AdService';
import { AddressSuggestionService } from '../../../services/AddressSuggestionService';
import { GoogleMapsService } from '../../../services/GoogleMapsService';
import { LocationService } from '../../../services/LocationService';
import { RadarService } from '../../../services/RadarService';
import { VoiceGuidanceService } from '../../../services/VoiceGuidanceService';
import { AnalyticsService } from '../../../services/AnalyticsService';
import { AUTOCOMPLETE_V2_ENABLED, RECENT_DESTINATIONS_KEY } from '../constants';
import { NavStep, RouteMeta, TabType } from '../types';
import { isHighwayManeuver, stripHtml } from '../utils/radarFormatters';
import { describeRadarApproachByDistance } from '../../../utils/radarAlerts';

// --- Helper Functions (Outside Hook to prevent recreation) ---

const toRecentSuggestion = (item: any): AddressSuggestion | null => {
  if (!item) return null;
  const label = typeof item === 'string' ? item.trim() : item.label?.trim();
  if (!label) return null;
  const lat = Number(item.latitude), lng = Number(item.longitude);
  return {
    id: item.id || `recent:${label.toLowerCase()}`,
    label,
    queryValue: item.queryValue || (Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : label),
    latitude: lat, longitude: lng,
    source: 'recent', qualityScore: Number(item.qualityScore) || 30,
  };
};

const resolveStepIndex = (loc: any, steps: NavStep[], fallback: number): number => {
  if (!loc || !steps.length) return fallback;
  const start = Math.max(0, fallback - 1);
  const end = Math.min(steps.length - 1, fallback + 6);
  let bestIdx = fallback, bestDist = Infinity;
  
  for (let i = start; i <= end; i++) {
    const step = steps[i];
    if (!step?.endLocation) continue;
    const d = LocationService.calculateDistanceSync(loc.latitude, loc.longitude, step.endLocation.latitude, step.endLocation.longitude) * 1000;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  
  if (bestDist <= 80) return Math.min(bestIdx + 1, steps.length - 1);
  if (bestIdx > fallback && bestDist <= 170) return bestIdx;
  return fallback;
};

const updateStepRouteProgress = (steps: NavStep[], coords: any[]): number[] => {
  if (!steps.length || !coords.length) return [];
  const progress: number[] = [];
  let searchStart = 0;
  for (const step of steps) {
    if (!step.endLocation) { progress.push(searchStart); continue; }
    let bestIdx = searchStart, bestDist = Infinity;
    for (let i = searchStart; i <= Math.min(coords.length - 1, searchStart + 160); i++) {
      const d = LocationService.calculateDistanceSync(step.endLocation.latitude, step.endLocation.longitude, coords[i].latitude, coords[i].longitude) * 1000;
      if (d < bestDist) { bestDist = d; bestIdx = i; if (d < 12) break; }
    }
    progress.push(bestIdx);
    searchStart = bestIdx;
  }
  return progress;
};

// --- Hook Implementation ---

type UseRadarNavigationParams = {
  canUsePro: boolean; mapRef: React.RefObject<MapView | null>; hasCenteredMapRef: React.MutableRefObject<boolean>;
  currentLocation: any; setCurrentLocation: (location: any) => void; currentLocationRef: React.MutableRefObject<any>;
  isDriving: boolean; setTotalDistance: React.Dispatch<React.SetStateAction<number>>; lastPositionRef: React.MutableRefObject<any>;
  startDrivingSession: (params: any) => Promise<void>; saveTripIfNeeded: () => Promise<void>; resetDrivingSession: () => void;
  setActiveTab: (tab: TabType) => void; resetSpeed: () => void; setNearbyRadars: React.Dispatch<React.SetStateAction<any[]>>;
  updateNearbyRadarsState: (incoming: any[]) => void; dismissDestinationInput: (onDismissFinalize?: () => void) => void;
  setDestinationInputFocused: (focused: boolean) => void; isTypingRef: React.MutableRefObject<boolean>;
  getCurrentSpeedKph: () => number; logRouteSteps: (payload: { destination: string; points: number; steps: NavStep[] }) => void;
};

export function useRadarNavigation({ canUsePro, mapRef, hasCenteredMapRef, currentLocation, setCurrentLocation, currentLocationRef, isDriving, setTotalDistance, lastPositionRef, startDrivingSession, saveTripIfNeeded, resetDrivingSession, setActiveTab, resetSpeed, setNearbyRadars, updateNearbyRadarsState, dismissDestinationInput, setDestinationInputFocused, isTypingRef, getCurrentSpeedKph, logRouteSteps }: UseRadarNavigationParams) {
  
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

  // Refs for high-frequency updates and closure management
  const searchTimerRef = useRef<any>(null);
  const searchRequestIdRef = useRef(0);
  const rerouteConsecutiveOffRouteRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const stepDistanceHistoryRef = useRef<any>({});
  const announcedTurnCueRef = useRef<any>({});
  const stepRouteProgressRef = useRef<number[]>([]);
  const navRefreshInFlightRef = useRef(false);
  const destinationCloseTickRef = useRef(0);
  const hasArrivalAnnouncementRef = useRef(false);
  const hasArrivedRef = useRef(false);
  const voiceRouteSessionRef = useRef('');

  // Sync refs for interval access
  const navStepsRef = useRef(navSteps); navStepsRef.current = navSteps;
  const routeCoordsRef = useRef(routeCoords); routeCoordsRef.current = routeCoords;
  const currentStepIndexRef = useRef(currentStepIndex); currentStepIndexRef.current = currentStepIndex;
  const destinationRef = useRef(destination); destinationRef.current = destination;
  const destinationCoordRef = useRef(destinationCoord); destinationCoordRef.current = destinationCoord;
  const routeMetaRef = useRef(routeMeta); routeMetaRef.current = routeMeta;
  
  useEffect(() => { hasArrivedRef.current = hasArrived; }, [hasArrived]);

  // Load Recents
  useEffect(() => {
    AsyncStorage.getItem(RECENT_DESTINATIONS_KEY).then(raw => {
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecentDestinations(parsed.map(toRecentSuggestion).filter(Boolean) as AddressSuggestion[]);
      }
    }).catch(() => {});
  }, []);

  // Location Bootstrap
  useEffect(() => {
    if (currentLocationRef.current || currentLocation) return;
    LocationService.getCurrentLocation().then(loc => {
      if (loc) { setCurrentLocation(loc); currentLocationRef.current = loc; }
    }).catch(() => {});
  }, [currentLocation, currentLocationRef, setCurrentLocation]);

  const persistRecentDestination = useCallback(async (suggestion: AddressSuggestion) => {
    const label = suggestion.label.trim();
    if (!label) return;
    const normalized: AddressSuggestion = { ...suggestion, id: suggestion.id || `recent:${label.toLowerCase()}`, label, source: 'recent', qualityScore: Math.max(40, suggestion.qualityScore || 0) };
    AddressSuggestionService.registerResolvedSuggestion(normalized);
    
    setRecentDestinations(prev => {
      const next = [normalized, ...prev.filter(i => i.label.toLowerCase() !== label.toLowerCase())].slice(0, 8);
      AsyncStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(next.map(i => ({ id: i.id, label: i.label, queryValue: i.queryValue, latitude: i.latitude, longitude: i.longitude, qualityScore: i.qualityScore })))).catch(() => {});
      return next;
    });
  }, []);

  const handleTextChange = useCallback((text: string) => {
    setDestination(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const query = text.trim().toLowerCase();
    if (!query) { setSuggestions([]); return; }

    // Local matches instant
    const localMatches = recentDestinations.filter(i => i.label.toLowerCase().includes(query)).slice(0, 6);
    setSuggestions(localMatches);

    if (query.length < 2) return;
    searchTimerRef.current = setTimeout(async () => {
      const focus = currentLocationRef.current;
      const results = await (AUTOCOMPLETE_V2_ENABLED 
        ? AddressSuggestionService.getHybridSuggestions({ query, recentDestinations, focusLocation: focus ? { latitude: focus.latitude, longitude: focus.longitude } : undefined, limit: 6 }).then(r => r.merged)
        : GoogleMapsService.getGeocodeSuggestions(query, { focusLocation: focus ? { latitude: focus.latitude, longitude: focus.longitude } : undefined }));
      setSuggestions(results.length > 0 ? results : localMatches);
    }, 300);
  }, [recentDestinations]);

  const handleNavigate = useCallback(async (targetDest?: string, params?: any) => {
    if (!canUsePro) await AdService.showInterstitial('navigate_route');
    
    let finalDest = (targetDest || destination).trim();
    if (AUTOCOMPLETE_V2_ENABLED && !targetDest && suggestions[0] && AddressSuggestionService.shouldAutoResolveTopSuggestion(finalDest, suggestions[0])) {
      finalDest = suggestions[0].queryValue || suggestions[0].label;
      if (suggestions[0].label) setDestination(suggestions[0].label);
    }
    if (!finalDest) return;

    // Reset state
    setRouteMeta(null); setDestinationCoord(params?.destinationCoord || null);
    rerouteConsecutiveOffRouteRef.current = 0; destinationCloseTickRef.current = 0;
    hasArrivalAnnouncementRef.current = false; hasArrivedRef.current = false;
    voiceRouteSessionRef.current = `route-${Date.now()}`;
    VoiceGuidanceService.resetCooldown(`route:${voiceRouteSessionRef.current}`);
    setArrivalState('none'); setDistanceToDestinationMeters(null); setHasArrived(false);

    try {
      dismissDestinationInput(() => { isTypingRef.current = false; setSuggestions([]); });
      
      let loc = currentLocationRef.current || currentLocation || await LocationService.getCurrentLocation();
      if (!loc) { alert('Location unavailable.'); return; }
      if (!currentLocationRef.current) { setCurrentLocation(loc); currentLocationRef.current = loc; }

      const res = await GoogleMapsService.getDirections(loc.latitude, loc.longitude, finalDest, { alternatives: true, prefer: 'duration' });
      if (!res?.coordinates?.length) { alert('No route found.'); return; }

      setRouteCoords(res.coordinates);
      const leg = res.legs?.[0];
      const destLabel = leg?.end_address || params?.destinationLabel || finalDest;
      const destCoord = leg?.end_location ? { latitude: leg.end_location.lat, longitude: leg.end_location.lng } : params?.destinationCoord || null;
      
      if (leg) {
        const dur = leg.duration_in_traffic || leg.duration;
        setRouteMeta({ etaText: dur?.text || 'ETA —', distanceText: leg.distance?.text || 'Dist —', destinationLabel: destLabel, distanceMeters: leg.distance?.value || null, durationSeconds: dur?.value || null });
      }
      setDestinationCoord(destCoord);

      await persistRecentDestination({ id: `recent:${destLabel.toLowerCase()}`, label: destLabel, queryValue: destCoord ? `${destCoord.latitude},${destCoord.longitude}` : finalDest, latitude: destCoord?.latitude, longitude: destCoord?.longitude, source: 'recent', qualityScore: 60 });
      
      await startDrivingSession({ setActiveTab, activateMapTab: true, source: 'navigate' });
      
      const steps: NavStep[] = (leg?.steps || []).map((s: any) => ({ instruction: stripHtml(s.html_instructions || ''), distanceMeters: s.distance?.value ?? null, maneuver: s.maneuver, endLocation: s.end_location ? { latitude: s.end_location.lat, longitude: s.end_location.lng } : undefined }));
      setNavSteps(steps); setCurrentStepIndex(0); stepDistanceHistoryRef.current = {};
      logRouteSteps({ destination: destLabel, points: res.coordinates.length, steps });

      const radars = (await RadarService.getRadarsAlongRoute(res.coordinates)).map(r => {
        const distance = LocationService.calculateDistanceSync(loc.latitude, loc.longitude, r.latitude, r.longitude) * 1000;
        return {
          ...r,
          distance,
          approachLabel: r.approachLabel || describeRadarApproachByDistance(distance),
        };
      });
      setNearbyRadars(radars.sort((a, b) => a.distance - b.distance));

      if (mapRef.current) {
        const heading = LocationService.calculateRouteBearing(loc.latitude, loc.longitude, res.coordinates);
        mapRef.current.animateCamera({ center: loc, heading: heading ?? 0, pitch: 0, zoom: 18.9 }, { duration: 320 });
        hasCenteredMapRef.current = true;
      }
    } catch (e) { console.error(e); alert('Route failed.'); }
  }, [canUsePro, destination, suggestions, currentLocation, dismissDestinationInput, isTypingRef, logRouteSteps, mapRef, hasCenteredMapRef, persistRecentDestination, setActiveTab, setCurrentLocation, setNearbyRadars, startDrivingSession]);

  const handleSelectSuggestion = useCallback((s: AddressSuggestion) => {
    setDestination(s.label); setSuggestions([]);
    persistRecentDestination(s);
    handleNavigate(s.queryValue || s.label, { destinationLabel: s.label, destinationCoord: Number.isFinite(s.latitude) ? { latitude: s.latitude, longitude: s.longitude } : undefined });
  }, [handleNavigate, persistRecentDestination]);

  const resetRoute = useCallback(async () => {
    await saveTripIfNeeded().catch(() => {});
    setDestination(''); setSuggestions([]); setRouteCoords([]); setRouteMeta(null); setDestinationCoord(null);
    setNavSteps([]); setCurrentStepIndex(0); stepDistanceHistoryRef.current = {}; announcedTurnCueRef.current = {};
    stepRouteProgressRef.current = []; rerouteConsecutiveOffRouteRef.current = 0; lastRerouteAtRef.current = 0;
    navRefreshInFlightRef.current = false; destinationCloseTickRef.current = 0; hasArrivalAnnouncementRef.current = false;
    hasArrivedRef.current = false; voiceRouteSessionRef.current = '';
    VoiceGuidanceService.stop().catch(() => {});
    setArrivalState('none'); setDistanceToDestinationMeters(null); setHasArrived(false);
    setTotalDistance(0); lastPositionRef.current = null; resetSpeed(); resetDrivingSession();
    setActiveTab('Basic'); setNearbyRadars([]); setDestinationInputFocused(false); isTypingRef.current = false;
    if (currentLocation) RadarService.getNearbyRadars(currentLocation.latitude, currentLocation.longitude, 10).then(updateNearbyRadarsState);
  }, [currentLocation, isTypingRef, lastPositionRef, resetDrivingSession, resetSpeed, saveTripIfNeeded, setActiveTab, setDestinationInputFocused, setNearbyRadars, setTotalDistance, updateNearbyRadarsState]);

  const getStepDistanceMeters = useCallback((step?: NavStep): number | null => {
    if (!step) return null;
    const loc = currentLocationRef.current;
    if (loc && step.endLocation) {
      return LocationService.calculateDistanceSync(
        loc.latitude,
        loc.longitude,
        step.endLocation.latitude,
        step.endLocation.longitude
      ) * 1000;
    }
    return typeof step.distanceMeters === 'number' ? step.distanceMeters : null;
  }, [currentLocationRef]);

  // Main Driving Loop
  useEffect(() => {
    if (!isDriving) return;
    
    const interval = setInterval(async () => {
      const loc = currentLocationRef.current;
      if (!loc) return;

      // Distance stats
      if (lastPositionRef.current) {
        const moved = LocationService.calculateDistanceSync(loc.latitude, loc.longitude, lastPositionRef.current.latitude, lastPositionRef.current.longitude);
        if (moved > 0.005) { setTotalDistance(p => p + moved); lastPositionRef.current = loc; }
      } else { lastPositionRef.current = loc; }

      // Step Progress
      let nextStep = currentStepIndexRef.current;
      const steps = navStepsRef.current;
      const step = steps[nextStep];
      
      if (step?.endLocation && nextStep < steps.length - 1) {
        const dMeters = LocationService.calculateDistanceSync(loc.latitude, loc.longitude, step.endLocation.latitude, step.endLocation.longitude) * 1000;
        const threshold = Math.max(55, Math.min(70, (step.distanceMeters || 100) * 0.35));
        const hist = stepDistanceHistoryRef.current[nextStep] || { lastDistanceMeters: dMeters, increasingTicks: 0 };
        
        if (dMeters <= threshold || (dMeters <= threshold + 90 && hist.increasingTicks >= 2)) {
          nextStep++;
        } else {
           hist.increasingTicks = dMeters > hist.lastDistanceMeters + 6 ? hist.increasingTicks + 1 : 0;
           hist.lastDistanceMeters = dMeters;
           stepDistanceHistoryRef.current[nextStep] = hist;
        }
      }
      
      nextStep = resolveStepIndex(loc, steps, nextStep);
      if (steps.length > 0 && routeCoordsRef.current.length > 0) {
         const progress = updateStepRouteProgress(steps, routeCoordsRef.current);
         stepRouteProgressRef.current = progress;
         // Logic to advance step based on route progress index could be added here if needed, simplified for brevity
      }
      
      if (nextStep !== currentStepIndexRef.current) setCurrentStepIndex(nextStep);

      // Voice Guidance
      const stepForCue = steps[nextStep];
      if (stepForCue?.endLocation) {
        const d = LocationService.calculateDistanceSync(loc.latitude, loc.longitude, stepForCue.endLocation.latitude, stepForCue.endLocation.longitude) * 1000;
        const cues = [{ k: 'prep', t: 250 }, { k: 'action', t: 60 }];
        for (const c of cues) {
          const key = `${voiceRouteSessionRef.current}:${nextStep}:${c.k}`;
          if (!announcedTurnCueRef.current[key] && d <= c.t) {
            VoiceGuidanceService.speak(c.k === 'action' ? `Now, ${stepForCue.instruction}` : `Prepare to ${stepForCue.instruction.toLowerCase()}`, { cooldownKey: `route:${key}`, cooldownMs: c.k === 'action' ? 4500 : 9000 }).then(ok => { if (ok) announcedTurnCueRef.current[key] = true; });
          }
        }
      }

      // Arrival & Reroute
      const dest = destinationCoordRef.current;
      if (dest && Number.isFinite(dest.latitude)) {
        const dDest = LocationService.calculateDistanceSync(loc.latitude, loc.longitude, dest.latitude, dest.longitude) * 1000;
        setDistanceToDestinationMeters(dDest);
        
        if (!hasArrivedRef.current) {
          if (dDest <= 25) destinationCloseTickRef.current++;
          else destinationCloseTickRef.current = 0;
          
          if ((dDest <= 25 && destinationCloseTickRef.current >= 2) || (dDest <= 35 && getCurrentSpeedKph() < 3)) {
            hasArrivedRef.current = true; setHasArrived(true); setArrivalState('arrived');
            if (!hasArrivalAnnouncementRef.current) { hasArrivalAnnouncementRef.current = true; VoiceGuidanceService.speak('You have arrived.', { cooldownKey: `route:${voiceRouteSessionRef.current}:arrived`, cooldownMs: 15000 }); }
          } else if (dDest <= 150) setArrivalState('approaching');
        }
      }

      // Reroute check
      const distToRoute = routeCoordsRef.current.length ? LocationService.calculateDistanceToPolyline(loc.latitude, loc.longitude, routeCoordsRef.current) : 0;
      if (distToRoute > 60) rerouteConsecutiveOffRouteRef.current = 3;
      else if (distToRoute > 35) rerouteConsecutiveOffRouteRef.current++;
      else rerouteConsecutiveOffRouteRef.current = 0;

      if (rerouteConsecutiveOffRouteRef.current >= 3 && Date.now() - lastRerouteAtRef.current > 3000 && !navRefreshInFlightRef.current) {
        navRefreshInFlightRef.current = true; lastRerouteAtRef.current = Date.now();
        try {
          const r = await GoogleMapsService.recalculateRoute(loc.latitude, loc.longitude, destinationRef.current, { legs: [{ steps: navStepsRef.current }], coordinates: routeCoordsRef.current });
          if (r?.coordinates?.length) {
            setRouteCoords(r.coordinates);
            const leg = r.legs?.[0];
            if (leg) {
              setRouteMeta(prev => {
                const base: RouteMeta = prev ?? {
                  etaText: '',
                  distanceText: '',
                  destinationLabel: destinationRef.current || destination || 'Destination',
                };
                return {
                  ...base,
                  etaText: leg.duration_in_traffic?.text || leg.duration?.text || base.etaText,
                  distanceText: leg.distance?.text || base.distanceText,
                };
              });
              const s: NavStep[] = (leg.steps || []).map((x: any) => ({ instruction: stripHtml(x.html_instructions || ''), distanceMeters: x.distance?.value, maneuver: x.maneuver, endLocation: x.end_location ? { latitude: x.end_location.lat, longitude: x.end_location.lng } : undefined }));
              setNavSteps(s); setCurrentStepIndex(resolveStepIndex(loc, s, 0)); stepDistanceHistoryRef.current = {};
            }
          }
        } catch (e) { console.error('Reroute fail', e); }
        finally { navRefreshInFlightRef.current = false; }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isDriving, currentLocationRef, lastPositionRef, setTotalDistance, getCurrentSpeedKph]);

  return {
    destination, setDestination, routeCoords, setRouteCoords, routeMeta, setRouteMeta,
    destinationCoord, setDestinationCoord, navSteps, setNavSteps, currentStepIndex,
    setCurrentStepIndex, suggestions, setSuggestions, recentDestinations, arrivalState,
    distanceToDestinationMeters, hasArrived, handleTextChange, handleNavigate,
    handleSelectSuggestion, resetRoute, rerouteConsecutiveOffRouteRef, lastRerouteAtRef,
    stepDistanceHistoryRef, navRefreshInFlightRef, getStepDistanceMeters,
  };
}