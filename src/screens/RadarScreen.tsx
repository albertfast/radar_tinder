import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  TextInput,
  Keyboard,
  Modal,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  Text,
  IconButton
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useRadarStore } from '../store/radarStore';
import { useAuthStore } from '../store/authStore';
import { RadarService } from '../services/RadarService';
import { GoogleMapsService } from '../services/GoogleMapsService';
import { LocationService } from '../services/LocationService';
import { OfflineService } from '../services/OfflineService';
import { SupabaseService } from '../services/SupabaseService';
import { NotificationService } from '../services/NotificationService';
import { AddressSuggestion, RadarAlert, RadarLocation } from '../types';
import { BlurView } from 'expo-blur';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { formatDistance, formatSpeed } from '../utils/format';
import { hasProAccess } from '../utils/access';
import AdBanner from '../components/AdBanner';
import { AdService } from '../services/AdService';
import { AnalyticsService } from '../services/AnalyticsService';
import RadarMap from '../components/RadarMap';
import { RadarGraphicView } from './components/RadarGraphicView';
import { RadarHomeDashboard } from './radar/components/RadarHomeDashboard';
import { useRouteTrace } from './radar/hooks/useRouteTrace';
import { useVoiceMode } from './radar/hooks/useVoiceMode';
import { useSpeedSmoothing } from './radar/hooks/useSpeedSmoothing';
import { useRadarSignalLevels } from './radar/hooks/useRadarSignalLevels';
import { RadarRendererMode } from '../components/RadarAnimation';
import { TAB_BAR_HEIGHT, getResponsivePadding, getResponsiveFontSize, getResponsiveMargin, getResponsiveWidth, getResponsiveHeight, getUIScale } from '../constants/layout';

import { darkMapStyle } from '../utils/mapStyle';

type TabType = 'Basic' | 'Map' | 'Graphic';
type NavStep = {
  instruction: string;
  distanceMeters: number | null;
  maneuver?: string;
  endLocation?: { latitude: number; longitude: number };
};

const PRO_FEATURES = [
    { title: 'Unlock All Radars', subtitle: 'See Police & Mobile traps', icon: 'shield-star', color: '#FFD700' },
    { title: 'AI Diagnostics', subtitle: 'Unlimited dashboard scans', icon: 'car-cog', color: '#4ECDC4' },
    { title: 'No Ads', subtitle: 'Distraction free driving', icon: 'block-helper', color: '#FF5252' },
];

const RECENT_DESTINATIONS_KEY = 'recent_destinations_v1';
const KEYBOARD_TRACE_ENABLED = /^(1|true|yes)$/i.test(
  process.env.EXPO_PUBLIC_KEYBOARD_TRACE || ''
);

const RadarScreen = ({ navigation, route }: any) => {
  const { user, refreshProfile } = useAuthStore();
  const canUsePro = hasProAccess(user);
  const {
    hasHydrated,
    unitSystem,
    voiceWarningsEnabled,
    hapticAlertsEnabled,
    keepAwakeWhileDriving,
    warningVolume,
    setVoiceWarningsEnabled,
    setWarningVolume,
  } = useSettingsStore();
  const setRadarLocations = useRadarStore((state) => state.setRadarLocations);
  const activeAlerts = useRadarStore((state) => state.activeAlerts);
  const acknowledgeAlert = useRadarStore((state) => state.acknowledgeAlert);
  const mapRef = useRef<MapView>(null);
  const { width, height } = useWindowDimensions();

  // Stats & States
  const [activeTab, setActiveTab] = useState<TabType>('Basic');
  const [isDriving, setIsDriving] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [nearbyRadars, setNearbyRadars] = useState<any[]>([]);
  const { uiSpeedKph: currentSpeed, pushLocationSample, resetSpeed } = useSpeedSmoothing({
    calculateDistanceSync: LocationService.calculateDistanceSync,
  });
  const [destination, setDestination] = useState('');
  const [routeCoords, setRouteCoords] = useState<any[]>([]);
  const [routeMeta, setRouteMeta] = useState<{ etaText: string; distanceText: string; destinationLabel: string } | null>(null);
  const [destinationCoord, setDestinationCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [recentDestinations, setRecentDestinations] = useState<AddressSuggestion[]>([]);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [drivingStartTime, setDrivingStartTime] = useState<Date | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [followHeading, setFollowHeading] = useState(true);
  const [isDestinationInputFocused, setIsDestinationInputFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [closestRadarHint, setClosestRadarHint] = useState('');

  // Refs for logic
  const currentLocationRef = useRef(currentLocation);
  const nearbyRadarsRef = useRef<any[]>([]);
  const isInteractingRef = useRef(false);
  const lastCameraUpdateRef = useRef(0);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const proSliderRef = useRef<FlatList>(null);
  const [proSliderIndex, setProSliderIndex] = useState(0);
  const hasCenteredMapRef = useRef(false);
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const searchRequestIdRef = useRef(0);
  const searchCountryCodeRef = useRef<string | undefined>(undefined);
  const tripStartRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const tripStartLabelRef = useRef<string | null>(null);
  const totalDistanceRef = useRef(totalDistance);
  const drivingStartTimeRef = useRef<Date | null>(drivingStartTime);
  const destinationInputRef = useRef<TextInput>(null);
  const lastDestinationFocusAtRef = useRef(0);
  const rerouteConsecutiveOffRouteRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const stepDistanceHistoryRef = useRef<Record<number, { lastDistanceMeters: number; increasingTicks: number }>>({});
  const navRefreshInFlightRef = useRef(false);
  const setTabBarHidden = useUiStore((state) => state.setTabBarHidden);
  const lastAnnouncedAlertIdRef = useRef<string | null>(null);
  const closestRadarLabelCacheRef = useRef<Record<string, string>>({});
  const closestRadarLabelRequestRef = useRef<Record<string, boolean>>({});

  // Refs for cleanup
  const lastPositionRef = useRef<any>(null);

  const uiScale = getUIScale();
  const mapOverlayInset = getResponsiveMargin(12);
  const mapOverlayTop = getResponsiveMargin(12);
  const mapControlSize = getResponsiveWidth(38);
  const mapControlGap = getResponsiveMargin(8);
  const isMapNavigationActive = isDriving && activeTab === 'Map' && routeCoords.length > 0;
  const mapControlsBottomBase = isMapNavigationActive
    ? Math.max(getResponsiveHeight(180), Math.round(height * 0.3))
    : Math.max(110, Math.round(height * 0.22));
  const mapNavDockBottom = isMapNavigationActive
    ? Math.max(getResponsiveHeight(70), mapOverlayInset + 48)
    : 0;
  const mapPadding = useMemo(
    () => ({
      top: isMapNavigationActive ? getResponsiveHeight(120) : getResponsiveHeight(160),
      right: mapOverlayInset,
      bottom: isMapNavigationActive ? getResponsiveHeight(320) : getResponsiveHeight(220),
      left: mapOverlayInset,
    }),
    [isMapNavigationActive, mapOverlayInset]
  );

  // Safe area & tab bar height to avoid overlaps (e.g., Start Driving button vs. pill tab)
  const insets = useSafeAreaInsets();
  const bottomSafe = Math.max(insets.bottom, 10);
  const tabBarInset = TAB_BAR_HEIGHT + bottomSafe + 16;
  const mapAdBottom = useMemo(
    () =>
      Math.max(
        tabBarInset + 8,
        isMapNavigationActive ? mapNavDockBottom + getResponsiveHeight(84) : tabBarInset + 8
      ),
    [isMapNavigationActive, mapNavDockBottom, tabBarInset]
  );
  const mapAdEstimatedHeight = getResponsiveHeight(62);
  const mapControlsBottom = useMemo(
    () =>
      Math.max(
        mapControlsBottomBase,
        mapAdBottom + mapAdEstimatedHeight + mapControlGap + getResponsiveHeight(6)
      ),
    [mapAdBottom, mapAdEstimatedHeight, mapControlGap, mapControlsBottomBase]
  );
  const floatingFabBottom = isMapNavigationActive
    ? Math.max(getResponsiveHeight(170), mapControlsBottom - mapControlSize - mapControlGap)
    : 85;
  const isMapInputLockActive = isDestinationInputFocused || isKeyboardVisible;
  const hideMapAd = isDestinationInputFocused || isKeyboardVisible;
  const radarAnimationSize = Math.max(176, Math.min(Math.round(width * 0.58), 290));
  const radarAuraSize = Math.round(radarAnimationSize * 0.78);

  const activeAlert = useMemo<RadarAlert | null>(() => {
    const unacknowledged = (activeAlerts as RadarAlert[]).filter((alert) => !alert.acknowledged);
    return unacknowledged.sort((a, b) => a.distance - b.distance)[0] || null;
  }, [activeAlerts]);

  const closestRadar = useMemo(() => {
    if (!nearbyRadars || nearbyRadars.length === 0) return null;
    return [...nearbyRadars].sort((a, b) => a.distance - b.distance)[0];
  }, [nearbyRadars]);

  const compassRotation = currentLocation?.heading != null
    ? `${currentLocation.heading}deg`
    : '0deg';
  const { voicePlaybackEnabled, alertModeLabel, toggleVoiceWarnings } = useVoiceMode({
    hasHydrated,
    voiceWarningsEnabled,
    hapticAlertsEnabled,
    warningVolume,
    setVoiceWarningsEnabled,
    setWarningVolume,
  });

  const { signalLevel: radarSignalLevel, dangerLevel: radarDangerLevel } = useRadarSignalLevels(nearbyRadars, closestRadar);
  const radarRendererMode: RadarRendererMode = 'auto';

  const extractShortStreetLabel = useCallback((label?: string | null) => {
    if (!label) return '';
    const firstSegment = label
      .split(',')
      .map((part) => part.trim())
      .find(Boolean);
    if (!firstSegment) return '';
    const noZip = firstSegment.replace(/\b\d{5}(?:-\d{4})?\b/g, '').trim();
    const noHouseNumber = noZip.replace(/^\d+[A-Za-z-]*\s+/, '').trim();
    return noHouseNumber || noZip || firstSegment;
  }, []);

  const nearestRadarSummary = useMemo(() => {
    if (!closestRadar) return 'Scanning...';
    const distanceLabel = formatDistance(closestRadar.distance, unitSystem);
    return closestRadarHint ? `${distanceLabel} at ${closestRadarHint}` : distanceLabel;
  }, [closestRadar, closestRadarHint, unitSystem]);
  const { logRouteSteps } = useRouteTrace();

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

  // --- Effects ---

  // Auto-scroll Pro Slider
  useEffect(() => {
    if (isDriving) return;
    const interval = setInterval(() => {
        let next = proSliderIndex + 1;
        if (next >= PRO_FEATURES.length) next = 0;
        setProSliderIndex(next);
        proSliderRef.current?.scrollToIndex({
          index: next,
          animated: true,
          viewPosition: 0.5,
        });
    }, 4000);
    return () => clearInterval(interval);
  }, [proSliderIndex, isDriving]);

  // Keep screen awake during driving mode
  useEffect(() => {
    const updateKeepAwake = async () => {
      if (isDriving && keepAwakeWhileDriving) {
        await activateKeepAwakeAsync();
      } else {
        deactivateKeepAwake();
      }
    };
    updateKeepAwake().catch(() => {});
    return () => {
      deactivateKeepAwake();
    };
  }, [isDriving, keepAwakeWhileDriving]);

  // Voice/haptic alert feedback for active hazards.
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
        liveSettings.hasHydrated &&
        liveSettings.voiceWarningsEnabled &&
        liveSettings.warningVolume > 0;
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

  // Hide bottom tab bar in driving mode or when Map tab is active
  useEffect(() => {
    setTabBarHidden(isDriving || activeTab === 'Map');
    return () => setTabBarHidden(false);
  }, [isDriving, activeTab, setTabBarHidden]);

  // Load recent destinations for local suggestions
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
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setIsKeyboardVisible(true);
      if (KEYBOARD_TRACE_ENABLED) {
        console.log('[KeyboardTrace] didShow', {
          height: event.endCoordinates?.height,
        });
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      if (KEYBOARD_TRACE_ENABLED) {
        console.log('[KeyboardTrace] didHide');
      }
    });
    return () => {
      showSub.remove();
      hideSub.remove();
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
  }, [closestRadar, extractShortStreetLabel]);

  // General Location Tracking
  useEffect(() => {
    const unsubscribe = useRadarStore.subscribe((state) => {
        const location = state.currentLocation;
        // Check if location actually changed to avoid loop
        if (location && (
            !currentLocationRef.current || 
            location.latitude !== currentLocationRef.current.latitude || 
            location.longitude !== currentLocationRef.current.longitude
        )) {
            currentLocationRef.current = location;
            setCurrentLocation(location);
            pushLocationSample(location);

            // Smooth Camera Follow
            if (isDriving && activeTab === 'Map' && !isInteractingRef.current && !isTypingRef.current) {
                const now = Date.now();
                if (now - lastCameraUpdateRef.current >= 2000) {
                    mapRef.current?.animateCamera({
                        center: { latitude: location.latitude, longitude: location.longitude },
                        pitch: 50,
                        heading: followHeading ? (location.heading || 0) : 0,
                        altitude: 800,
                        zoom: 17
                    }, { duration: 1500 });
                    lastCameraUpdateRef.current = now;
                }
            }
        }
    });

    return unsubscribe;
  }, [isDriving, activeTab, followHeading]);

  // Center the camera the first time we get a fix so the map doesn't stay on the default city
  useEffect(() => {
    if (currentLocation && mapRef.current && !hasCenteredMapRef.current) {
        mapRef.current.animateCamera({
          center: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
          zoom: 15,
          pitch: 45,
          heading: followHeading ? (currentLocation.heading || 0) : 0,
        }, { duration: 800 });
        hasCenteredMapRef.current = true;
    }
  }, [currentLocation, followHeading]);

  useEffect(() => {
    totalDistanceRef.current = totalDistance;
  }, [totalDistance]);

  useEffect(() => {
    drivingStartTimeRef.current = drivingStartTime;
  }, [drivingStartTime]);

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

  // Periodic Radar Fetch
  useEffect(() => {
    const fetchNearby = async () => {
        const loc = currentLocationRef.current || await LocationService.getCurrentLocation();
        if (loc) {
            const radars = await RadarService.getNearbyRadars(loc.latitude, loc.longitude, 10);
            updateNearbyRadarsState(radars);
        }
    };
    fetchNearby();
    const interval = setInterval(fetchNearby, 15000);
    return () => clearInterval(interval);
  }, [updateNearbyRadarsState]);

  // Unified driving scheduler: distance accounting + step progression + reroute hysteresis.
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

    const isHighwayManeuver = (step?: NavStep) => {
      const maneuver = (step?.maneuver || '').toLowerCase();
      const instruction = (step?.instruction || '').toLowerCase();
      return (
        maneuver.includes('ramp') ||
        maneuver.includes('merge') ||
        maneuver.includes('fork') ||
        maneuver.includes('keep') ||
        instruction.includes('highway') ||
        instruction.includes('motorway') ||
        instruction.includes('exit') ||
        instruction.includes('ramp')
      );
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
          setCurrentStepIndex((prev) => Math.min(prev + 1, navSteps.length - 1));
        }
      }

      if (!routeCoords.length || !destination) return;
      const distanceToRoute = computeRouteProximityMeters(loc);
      if (distanceToRoute > 75) {
        rerouteConsecutiveOffRouteRef.current += 1;
      } else if (distanceToRoute < 45) {
        rerouteConsecutiveOffRouteRef.current = 0;
      }

      const shouldReroute =
        rerouteConsecutiveOffRouteRef.current >= 2 &&
        Date.now() - lastRerouteAtRef.current > 12000 &&
        !navRefreshInFlightRef.current;
      if (!shouldReroute) return;

      navRefreshInFlightRef.current = true;
      lastRerouteAtRef.current = Date.now();
      try {
        const currentStepSnapshot = navSteps[currentStepIndex];
        const previousInstruction = currentStepSnapshot?.instruction || '';
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

        const newCoords = reroute.coordinates;
        setRouteCoords(newCoords);

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
          const matchedIndex = parsedSteps.findIndex(
            (step) => step.instruction && step.instruction === previousInstruction
          );
          const safeIndex = matchedIndex >= 0 ? matchedIndex : Math.min(currentStepIndex, parsedSteps.length - 1);
          setCurrentStepIndex(safeIndex);
        }
      } catch (error) {
        console.error('[RadarScreen] Reroute scheduler failed:', error);
      } finally {
        navRefreshInFlightRef.current = false;
      }
    }, 2500);

    return () => clearInterval(scheduler);
  }, [
    currentLocation,
    currentStepIndex,
    destination,
    destinationCoord,
    isDriving,
    navSteps,
    routeCoords,
    routeMeta,
  ]);

  // --- Handlers ---

  const decodeHtmlEntities = (text: string) =>
    text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  const stripHtml = (html: string) =>
    decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();

  const formatStepDistance = (meters?: number | null) => {
    if (meters === null || meters === undefined) return '';
    if (unitSystem === 'imperial') {
      const feet = meters * 3.28084;
      if (feet < 1000) return `${Math.round(feet)} ft`;
      const miles = meters / 1609.344;
      return `${miles.toFixed(1)} mi`;
    }
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const getManeuverIcon = (maneuver?: string) => {
    switch (maneuver) {
      case 'turn-left':
        return 'arrow-left';
      case 'turn-right':
        return 'arrow-right';
      case 'turn-slight-left':
      case 'keep-left':
      case 'fork-left':
      case 'exit-left':
        return 'arrow-top-left';
      case 'turn-slight-right':
      case 'keep-right':
      case 'fork-right':
      case 'exit-right':
        return 'arrow-top-right';
      case 'turn-sharp-left':
        return 'arrow-bottom-left';
      case 'turn-sharp-right':
        return 'arrow-bottom-right';
      case 'uturn-left':
      case 'uturn-right':
        return 'backup-restore';
      case 'merge':
        return 'call-merge';
      case 'roundabout-left':
      case 'roundabout-right':
        return 'rotate-right';
      case 'ramp-left':
        return 'arrow-top-left';
      case 'ramp-right':
        return 'arrow-top-right';
      case 'straight':
      case 'continue':
      default:
        return 'arrow-up';
    }
  };

  const formatRadarLabel = (type?: RadarLocation['type']) => {
    switch (type) {
      case 'red_light':
        return 'Red Light Camera';
      case 'fixed':
        return 'Fixed Camera';
      case 'mobile':
        return 'Mobile Radar';
      case 'police':
        return 'Police';
      case 'traffic_enforcement':
        return 'Traffic Enforcement';
      case 'speed_camera':
      default:
        return 'Speed Camera';
    }
  };

  const canConfirmRadar = (radar?: RadarLocation) => {
    if (!radar?.id) return false;
    return (
      !radar.id.startsWith('osm-') &&
      !radar.id.startsWith('google-') &&
      !radar.id.startsWith('mock-')
    );
  };

  const getStepDistanceMeters = (step?: NavStep) => {
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
  };

  const ensureDrivingSessionStarted = useCallback(
    async (params?: { activateMapTab?: boolean; source?: 'manual' | 'navigate' | 'force_tab' }) => {
      const activateMapTab = params?.activateMapTab ?? true;
      const source = params?.source || 'manual';
      if (activateMapTab) {
        setActiveTab('Map');
      }
      setIsDriving(true);

      if (drivingStartTimeRef.current && tripStartRef.current) {
        return;
      }

      const startTime = new Date();
      setDrivingStartTime(startTime);
      drivingStartTimeRef.current = startTime;
      setTotalDistance(0);
      totalDistanceRef.current = 0;

      tripStartRef.current = null;
      tripStartLabelRef.current = null;

      const startLoc = currentLocationRef.current || currentLocation;
      if (startLoc?.latitude && startLoc?.longitude) {
        tripStartRef.current = {
          latitude: startLoc.latitude,
          longitude: startLoc.longitude,
          timestamp: Date.now(),
        };
        LocationService.reverseGeocode(startLoc.latitude, startLoc.longitude)
          .then((addresses) => {
            tripStartLabelRef.current = formatGeocodeLabel(addresses[0], startLoc);
          })
          .catch(() => {});
      }

      AnalyticsService.trackEvent('drive_start', {
        source,
        location: startLoc ? `${startLoc.latitude},${startLoc.longitude}` : 'unknown',
      });
    },
    [currentLocation]
  );

  // Force tab when navigation params request it
  useEffect(() => {
    const forceTab = route?.params?.forceTab as TabType | undefined;
    if (!forceTab) return;

    const applyForcedTab = async () => {
      if (forceTab === 'Map' || forceTab === 'Graphic') {
        if (forceTab === 'Graphic' && !canUsePro) {
          setActiveTab('Basic');
          setIsDriving(false);
        } else {
          await ensureDrivingSessionStarted({
            activateMapTab: forceTab === 'Map',
            source: 'force_tab',
          });
          if (forceTab === 'Graphic') {
            setActiveTab('Graphic');
          }
        }
      } else if (forceTab === 'Basic') {
        setActiveTab('Basic');
        setIsDriving(false);
      }
      navigation.setParams?.({ forceTab: undefined });
    };

    applyForcedTab().catch(() => {
      navigation.setParams?.({ forceTab: undefined });
    });
  }, [route?.params?.forceTab, canUsePro, ensureDrivingSessionStarted, navigation]);

  const toggleDrivingMode = async () => {
    if (!isDriving) {
      await ensureDrivingSessionStarted({ activateMapTab: true, source: 'manual' });
      return;
    }
    const startTime = drivingStartTimeRef.current;
    AnalyticsService.trackEvent('drive_stop', {
      duration: startTime ? (new Date().getTime() - startTime.getTime()) / 1000 : 0,
      distance: totalDistanceRef.current
    });

    await saveTripIfNeeded();

    setIsDriving(false);
    setActiveTab('Basic');
    setDrivingStartTime(null);
    drivingStartTimeRef.current = null;
    tripStartRef.current = null;
    tripStartLabelRef.current = null;

    // Show interstitial for free users when they finish a trip
    if (AdService.shouldShowAds()) {
      await AdService.showInterstitial();
    }
  };

  const centerMap = () => {
    if (currentLocation && mapRef.current) {
        mapRef.current.animateCamera({
            center: {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
            },
            zoom: 17,
            heading: followHeading ? (currentLocation.heading || 0) : 0,
            pitch: 60,
        }, { duration: 1000 });
        isInteractingRef.current = false;
    }
  };

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

  const handleTextChange = (text: string) => {
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

    // Start fetching suggestions after 2 characters
    if (query.length < 2) return;

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    // Debounce 600ms to account for Nominatim rate limiting (1 req/sec)
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
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
      const navigateTarget = suggestion.queryValue || suggestion.label;
      setDestination(suggestion.label);
      setSuggestions([]); // clear
      persistRecentDestination(suggestion);
      handleNavigate(navigateTarget, {
        destinationLabel: suggestion.label,
        destinationCoord:
          Number.isFinite(suggestion.latitude) && Number.isFinite(suggestion.longitude)
            ? { latitude: suggestion.latitude, longitude: suggestion.longitude }
            : undefined,
      });
  };

  const formatGeocodeLabel = (
    addr?: {
      name?: string | null;
      street?: string | null;
      city?: string | null;
      region?: string | null;
      country?: string | null;
    },
    coords?: { latitude: number; longitude: number }
  ) => {
    if (addr) {
      const main = [addr.name, addr.street, addr.city].filter(Boolean).join(' ');
      const region = [addr.region, addr.country].filter(Boolean).join(', ');
      return [main, region].filter(Boolean).join(', ');
    }
    if (coords) {
      return `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
    }
    return 'Unknown';
  };

  const setDestinationInputFocused = useCallback((focused: boolean) => {
    setIsDestinationInputFocused(focused);
  }, []);

  const dismissDestinationInput = useCallback(() => {
    if (destinationInputRef.current?.isFocused()) {
      destinationInputRef.current.blur();
    }
    setDestinationInputFocused(false);
    isTypingRef.current = false;
    searchRequestIdRef.current += 1;
    setSuggestions([]);
    Keyboard.dismiss();
  }, [setDestinationInputFocused]);

  const saveTripIfNeeded = useCallback(async () => {
    if (!user) return;
    const startTime = drivingStartTimeRef.current;
    if (!startTime || !tripStartRef.current) return;

    const distanceMeters = Math.round(totalDistanceRef.current * 1000);
    if (distanceMeters < 200) {
      tripStartRef.current = null;
      tripStartLabelRef.current = null;
      return;
    }

    const endTime = new Date();
    const durationSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
    const endLocation = currentLocationRef.current || currentLocation;

    let startLabel = tripStartLabelRef.current;
    if (!startLabel && tripStartRef.current) {
      try {
        const addresses = await LocationService.reverseGeocode(
          tripStartRef.current.latitude,
          tripStartRef.current.longitude
        );
        startLabel = formatGeocodeLabel(addresses[0], tripStartRef.current);
        tripStartLabelRef.current = startLabel;
      } catch (error) {}
    }

    let endLabel = 'End';
    if (endLocation?.latitude && endLocation?.longitude) {
      try {
        const addresses = await LocationService.reverseGeocode(
          endLocation.latitude,
          endLocation.longitude
        );
        endLabel = formatGeocodeLabel(addresses[0], endLocation);
      } catch (error) {
        endLabel = formatGeocodeLabel(undefined, endLocation);
      }
    }

    await SupabaseService.createTrip({
      userId: user.id,
      startLocation: startLabel || 'Start',
      endLocation: endLabel,
      distance: distanceMeters,
      duration: durationSeconds,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      score: 0,
    });

    tripStartRef.current = null;
    tripStartLabelRef.current = null;
  }, [currentLocation, user]);

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
    rerouteConsecutiveOffRouteRef.current = 0;
    lastRerouteAtRef.current = 0;
    navRefreshInFlightRef.current = false;
    setIsDriving(false);
    setDrivingStartTime(null);
    drivingStartTimeRef.current = null;
    setTotalDistance(0);
    totalDistanceRef.current = 0;
    resetSpeed();
    tripStartRef.current = null;
    tripStartLabelRef.current = null;
    setActiveTab('Basic');
    setNearbyRadars([]);
    setDestinationInputFocused(false);
    isTypingRef.current = false;
    if (currentLocation) {
      RadarService.getNearbyRadars(currentLocation.latitude, currentLocation.longitude, 10).then(updateNearbyRadarsState);
    }
  }, [currentLocation, resetSpeed, saveTripIfNeeded, setDestinationInputFocused, updateNearbyRadarsState]);

  const exitDrivingToHome = useCallback(async () => {
    await resetRoute();
    navigation.getParent?.()?.navigate('Home');
  }, [navigation, resetRoute]);

  const markInteracting = useCallback(() => {
    isInteractingRef.current = true;
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    interactionTimeoutRef.current = setTimeout(() => {
      if (!isTypingRef.current) {
        isInteractingRef.current = false;
      }
    }, 2000);
  }, []);

  const handleMapTouchStart = useCallback(() => {
    if (isMapInputLockActive) return;
    markInteracting();
  }, [isMapInputLockActive, markInteracting]);

  const handleMapTap = useCallback(() => {
    if (Date.now() - lastDestinationFocusAtRef.current < 450) {
      return;
    }
    if (isDestinationInputFocused) {
      dismissDestinationInput();
      return;
    }
    if (isKeyboardVisible) {
      dismissDestinationInput();
      return;
    }
    setSuggestions([]);
  }, [dismissDestinationInput, isDestinationInputFocused, isKeyboardVisible]);

  const endInteracting = useCallback(() => {
    if (!isTypingRef.current) {
      isInteractingRef.current = false;
    }
  }, []);

  const zoomMap = useCallback(async (delta: number) => {
    if (!mapRef.current) return;
    try {
      const camera = await mapRef.current.getCamera();
      const currentZoom = typeof camera.zoom === 'number' ? camera.zoom : 17;
      const nextZoom = Math.max(2, Math.min(20, currentZoom + delta));
      mapRef.current.animateCamera({ zoom: nextZoom }, { duration: 200 });
      markInteracting();
    } catch (error) {}
  }, [markInteracting]);

  const toggleHeadingMode = useCallback(() => {
    markInteracting();
    setFollowHeading((prev) => {
      const next = !prev;
      const heading = next ? (currentLocation?.heading || 0) : 0;
      mapRef.current?.animateCamera({ heading }, { duration: 300 });
      return next;
    });
  }, [currentLocation, markInteracting]);

  const handleNavigate = async (
    targetDest?: string,
    params?: {
      destinationLabel?: string;
      destinationCoord?: { latitude: number; longitude: number };
    }
  ) => {
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

    try {
      dismissDestinationInput();

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
      const resolvedDestinationLabel =
        primaryLeg?.end_address || params?.destinationLabel || finalDest;
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

      await ensureDrivingSessionStarted({ activateMapTab: true, source: 'navigate' });
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
        rawRouteRadars.map(async (r) => {
          const d = await LocationService.calculateDistance(loc.latitude, loc.longitude, r.latitude, r.longitude);
          return { ...r, distance: d };
        })
      );

      setNearbyRadars(routeRadarsWithDist.sort((a, b) => a.distance - b.distance));
      setSuggestions([]);

      mapRef.current?.fitToCoordinates(res.coordinates, {
        edgePadding: { top: 180, right: 80, bottom: 260, left: 80 },
        animated: true,
      });
      hasCenteredMapRef.current = true;
    } catch (error) {
      console.error('Navigation failed:', error);
      alert('Route could not be created. Check your connection and try again.');
    }
  };

  const handleReportRadar = async (type: RadarLocation['type']) => {
      setReportModalVisible(false);
      if (!user) {
        alert('Please log in to report hazards.');
        return;
      }

      const loc = currentLocationRef.current || await LocationService.getCurrentLocation().catch(() => null);
      if (!loc) {
        alert('Location unavailable. Please enable location services.');
        return;
      }

      try {
        await RadarService.reportRadarLocation({
          latitude: loc.latitude,
          longitude: loc.longitude,
          type,
          confidence: 0.7,
          lastConfirmed: new Date(),
          reportedBy: user.id,
        });

        const refreshed = await RadarService.getNearbyRadars(loc.latitude, loc.longitude, 10);
        updateNearbyRadarsState(refreshed);

        await refreshProfile();
        alert('Report sent. Nearby drivers will be notified.');
      } catch (error) {
        console.error('Report hazard failed:', error);
        try {
          await OfflineService.saveRadarLocationOffline({
            id: `offline-${Date.now()}`,
            latitude: loc.latitude,
            longitude: loc.longitude,
            type,
            confidence: 0.7,
            lastConfirmed: new Date(),
            reportedBy: user.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);
          alert('Saved offline. Will sync when online.');
        } catch (offlineError) {
          alert('Failed to report hazard. Please try again.');
        }
      }
  };

  const handleConfirmRadar = async (radar: RadarLocation) => {
      if (!user) {
        alert('Please log in to confirm reports.');
        return;
      }

      const loc = currentLocationRef.current || currentLocation;
      if (!loc) {
        alert('Location unavailable. Please enable location services.');
        return;
      }

      const reportId = await SupabaseService.confirmNearbyReport({
        latitude: loc.latitude,
        longitude: loc.longitude,
        radiusMeters: 150,
        type: radar.type,
      });

      if (reportId) {
        await refreshProfile();
        alert('Thanks! Confirmation recorded.');
      } else {
        alert('No community report to confirm nearby.');
      }
  };

  // --- RENDER ---

  if (isDriving) {
      // DRIVING MODE UI
      return (
          <View style={styles.container}>
              <LinearGradient colors={['#000000', '#1A1A1A']} style={StyleSheet.absoluteFill} />
              
              {/* Driving Header */}
              <View style={[styles.drivingHeader, { paddingTop: insets.top + 8 }]}>
                  <IconButton icon="home-variant" iconColor="#fff" size={28} onPress={exitDrivingToHome} />
                  <View style={{alignItems: 'center'}}>
                      <Text style={styles.drivingModeTitle}>DRIVING MODE</Text>
                      <Text style={styles.drivingModeSub}>MAP</Text>
                  </View>
                  <IconButton icon="cog" iconColor="#fff" onPress={() => navigation.navigate('RadarSettings')} />
              </View>

              {/* Enhanced Navigation Alerts */}
              {activeAlert ? (
                  <Animated.View
                    style={[styles.liveAlertBanner, {
                      transform: [{ translateY: activeAlert ? 0 : -100 }]
                    }]}
                    entering={FadeInUp.duration(300)}
                  >
                      <View style={styles.liveAlertIcon}>
                          <MaterialCommunityIcons name="alert" size={18} color="#FF5252" />
                      </View>
                      <View style={{ flex: 1 }}>
                          <Text style={styles.liveAlertTitle}>
                            {formatRadarLabel(activeAlert.type)}
                          </Text>
                          <Text style={styles.liveAlertSubtitle}>
                            {formatDistance(activeAlert.distance, unitSystem)}
                            {activeAlert.locationLabel
                              ? ` • ${activeAlert.locationLabel.split(',').slice(0, 2).join(', ')}`
                              : ''}
                            {' • '}
                            ETA {Math.max(1, Math.round(activeAlert.estimatedTime * 60))} min
                          </Text>
                      </View>
                      <TouchableOpacity onPress={() => acknowledgeAlert(activeAlert.id)} style={styles.liveAlertDismiss}>
                          <MaterialCommunityIcons name="close" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                  </Animated.View>
              ) : (
                // Navigation Progress Alert
                routeCoords.length > 0 && !isMapNavigationActive && (
                  <Animated.View
                    style={[styles.navigationProgress, {
                      transform: [{ translateY: 0 }]
                    }]}
                    entering={FadeInUp.duration(300)}
                  >
                      <View style={styles.progressIcon}>
                          <MaterialCommunityIcons name="navigation" size={18} color="#4ECDC4" />
                      </View>
                      <View style={{ flex: 1 }}>
                          <Text style={styles.progressTitle}>
                            {routeMeta?.destinationLabel || 'Navigation Active'}
                          </Text>
                          <Text style={styles.progressSubtitle}>
                            {navSteps[currentStepIndex]?.instruction || 'Following route...'}
                          </Text>
                      </View>
                      <View style={styles.progressDistance}>
                          <Text style={styles.progressDistanceText}>
                            {formatStepDistance(getStepDistanceMeters(navSteps[currentStepIndex]))}
                          </Text>
                      </View>
                  </Animated.View>
                )
              )}

              {/* Tabs */}
              {!isMapNavigationActive && (
                <View style={styles.tabBar}>
                    {(['Basic', 'Map', 'Graphic'] as TabType[]).map(t => (
                        <TouchableOpacity 
                          key={t} 
                          style={[styles.tabItem, activeTab === t && styles.activeTabItem]}
                          onPress={() => {
                            if (t === 'Graphic' && !canUsePro) {
                              navigation.navigate('Subscription');
                              return;
                            }
                            setActiveTab(t);
                          }}
                        >
                            <Text style={[styles.tabText, activeTab === t && { color: '#FF5252' }]}>{t}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
              )}

              <View style={{ flex: 1 }}>
                  {activeTab === 'Basic' && (
                      <ScrollView
                        style={styles.basicScroll}
                        contentContainerStyle={[styles.basicContainer, { paddingBottom: tabBarInset + 22 }]}
                        showsVerticalScrollIndicator={false}
                        scrollEnabled
                      >
                        <View style={styles.basicTopAdContainer}>
                          <AdBanner size="LARGE_BANNER" />
                        </View>

                        <View style={styles.hudCircle}>
                          <Text style={styles.speedText}>{formatSpeed(currentSpeed, unitSystem).split(' ')[0]}</Text>
                          <Text style={styles.unitText}>{formatSpeed(currentSpeed, unitSystem).split(' ')[1]}</Text>
                          <View style={[styles.ring, { borderColor: '#4ECDC4' }]} />
                          <View style={[styles.ring, { width: 230, height: 230, borderColor: 'rgba(78,205,196,0.3)', borderWidth: 1 }]} />
                        </View>

                        <View style={styles.alertsList}>
                          <Text style={styles.sectionHeader}>NEARBY RADARS</Text>
                          {nearbyRadars.length > 0 ? (
                            nearbyRadars.slice(0, 20).map((r, i) => (
                              <View key={i} style={styles.alertItem}>
                                <MaterialCommunityIcons
                                  name={r.type === 'police' ? 'alarm-light' : 'camera'}
                                  size={24}
                                  color={r.type === 'police' ? '#FF5252' : '#4ECDC4'}
                                />
                                <Text style={styles.alertText}>
                                  {r.type === 'police' ? 'Police Spotted' : 'Speed Camera'}
                                </Text>
                                <Text style={styles.alertDist}>{formatDistance(r.distance, unitSystem)}</Text>
                              </View>
                            ))
                          ) : (
                            <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>Scanning area...</Text>
                          )}
                        </View>

                        <View style={styles.basicBottomAdContainer}>
                          <AdBanner size="MEDIUM_RECTANGLE" />
                        </View>
                      </ScrollView>
                  )}

                  {activeTab === 'Map' && (
                      <View style={{flex: 1}}>
                            <View
                              style={StyleSheet.absoluteFill}
                              pointerEvents={isMapInputLockActive ? 'none' : 'auto'}
                            >
                              <RadarMap
                                  location={currentLocation || {latitude: 37.7749, longitude: -122.4194}}
                                  radars={nearbyRadars}
                                  routeCoords={routeCoords}
                                  mapRef={mapRef}
                                  showsUserLocation={true}
                                  destinationPoint={destinationCoord}
                                  mapPadding={mapPadding}
                                  onRadarPress={(radar: RadarLocation) => {
                                    if (canConfirmRadar(radar)) {
                                      handleConfirmRadar(radar);
                                    }
                                  }}
                                  onMapTouchStart={handleMapTouchStart}
                                  onMapTouchEnd={endInteracting}
                                  mapInteractionEnabled={!isMapInputLockActive}
                                  onMapTap={handleMapTap}
                              />
                            </View>
                            <View 
                              style={[styles.mapOverlay, { top: mapOverlayTop, left: mapOverlayInset, right: mapOverlayInset }]}
                              pointerEvents="box-none"
                            >
                                       {routeCoords.length === 0 ? (
                                     <>
                                       <View style={{flexDirection: 'row', alignItems: 'center', gap: mapControlGap}} pointerEvents="box-none">
                                           <View style={{flex: 1}}>
                                              <TextInput 
                                                  ref={destinationInputRef}
                                                  placeholder="Enter destination" 
                                                  placeholderTextColor="#aaa"
                                                  style={[
                                                    styles.mapInput,
                                                    {
                                                      paddingVertical: getResponsivePadding(10),
                                                      paddingHorizontal: getResponsivePadding(12),
                                                      fontSize: getResponsiveFontSize(15),
                                                    },
                                                  ]}
                                                  value={destination}
                                                  onChangeText={handleTextChange}
                                                  onSubmitEditing={() => {
                                                    handleNavigate();
                                                  }}
                                                  returnKeyType="search"
                                                  blurOnSubmit={false}
                                                  enablesReturnKeyAutomatically
                                                  autoCorrect={false}
                                                  autoCapitalize="none"
                                                  keyboardType="default"
                                                  autoFocus={false}
                                                  showSoftInputOnFocus={true}
                                                  onTouchStart={() => {
                                                    lastDestinationFocusAtRef.current = Date.now();
                                                  }}
                                                  onFocus={() => {
                                                    if (KEYBOARD_TRACE_ENABLED) {
                                                      console.log('[KeyboardTrace] inputFocus');
                                                    }
                                                    lastDestinationFocusAtRef.current = Date.now();
                                                    setDestinationInputFocused(true);
                                                    isTypingRef.current = true;
                                                    isInteractingRef.current = true;
                                                    if (!destination.trim() && recentDestinations.length > 0) {
                                                      setSuggestions(recentDestinations.slice(0, 6));
                                                    }
                                                  }}
                                                  onBlur={() => {
                                                    if (KEYBOARD_TRACE_ENABLED) {
                                                      console.log('[KeyboardTrace] inputBlur');
                                                    }
                                                    setDestinationInputFocused(false);
                                                    isTypingRef.current = false;
                                                    setTimeout(() => {
                                                      setSuggestions([]);
                                                      endInteracting();
                                                    }, 120);
                                                  }}
                                              />
                                           </View>
                                           
                                           <TouchableOpacity 
                                                style={[styles.iconBtn, { backgroundColor: '#4ECDC4', padding: 12 }]} 
                                                onPress={() => handleNavigate()}
                                           >
                                               <Text style={{color: 'black', fontWeight: 'bold'}}>GO</Text>
                                           </TouchableOpacity>

                                          {destination.length > 0 && (
                                                <TouchableOpacity 
                                                    style={[styles.iconBtn, { backgroundColor: '#FF5252', padding: 12 }]} 
                                                    onPress={() => {
                                                      setDestination('');
                                                      setSuggestions([]);
                                                    }}
                                                >
                                                    <MaterialCommunityIcons name="close" size={24} color="white" />
                                                </TouchableOpacity>
                                           )}

                                           <TouchableOpacity 
                                                style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.8)', padding: 12 }]} 
                                                onPress={centerMap}
                                           >
                                               <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#4ECDC4" />
                                           </TouchableOpacity>
                                       </View>
                                       
                                       {suggestions.length > 0 && (
                                           <View style={styles.suggestionsContainer}>
                                               {suggestions.map((item, index) => (
                                                   <TouchableOpacity 
                                                       key={item.id || `${item.label}-${index}`} 
                                                       style={styles.suggestionItem}
                                                       onPress={() => handleSelectSuggestion(item)}
                                                   >
                                                       <MaterialCommunityIcons name="map-marker-outline" size={20} color="#94A3B8" />
                                                       <Text style={styles.suggestionText} numberOfLines={1}>{item.label}</Text>
                                                   </TouchableOpacity>
                                               ))}
                                           </View>
                                       )}
                                     </>
                                   ) : (
                                     <View style={styles.navCompactRow}>
                                       <View style={styles.navCompactInfo}>
                                         <Text style={styles.navCompactTitle} numberOfLines={1}>
                                           {routeMeta?.destinationLabel || destination || 'Destination'}
                                         </Text>
                                         <Text style={styles.navCompactMeta}>
                                           {routeMeta?.distanceText || '—'} • ETA {routeMeta?.etaText || '—'} • {nearbyRadars.length} radars
                                         </Text>
                                       </View>
                                       <TouchableOpacity
                                         style={styles.navCompactButton}
                                         onPress={centerMap}
                                       >
                                         <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#4ECDC4" />
                                       </TouchableOpacity>
                                       <TouchableOpacity
                                         style={[styles.navCompactButton, styles.navCompactButtonDanger]}
                                         onPress={resetRoute}
                                       >
                                         <MaterialCommunityIcons name="close" size={20} color="#F8FAFC" />
                                       </TouchableOpacity>
                                     </View>
                                   )}
                           </View>
                           {isMapNavigationActive && (
                             <View
                               style={[
                                 styles.bottomNavDock,
                                 { left: mapOverlayInset, right: mapOverlayInset, bottom: mapNavDockBottom },
                               ]}
                               pointerEvents="box-none"
                             >
                               <View style={[styles.navInstructionBox, styles.navInstructionDock, { padding: Math.round(10 * uiScale) }]}>
                                 <MaterialCommunityIcons
                                   name={getManeuverIcon(navSteps[currentStepIndex]?.maneuver)}
                                   size={24}
                                   color="white"
                                 />
                                 <View style={{ marginLeft: 12, flex: 1 }}>
                                   <Text style={{ color: 'white', fontSize: Math.round(14 * uiScale), fontWeight: 'bold' }}>
                                     {formatStepDistance(getStepDistanceMeters(navSteps[currentStepIndex])) || '...'}
                                   </Text>
                                   <Text style={{ color: '#cbd5f5', fontSize: Math.round(11 * uiScale) }} numberOfLines={2}>
                                     {navSteps[currentStepIndex]?.instruction || 'Follow the highlighted route'}
                                   </Text>
                                 </View>
                               </View>
                             </View>
                           )}
                           <View
                             pointerEvents={hideMapAd ? 'none' : 'auto'}
                             style={[
                               styles.mapAdContainer,
                               {
                                 left: mapOverlayInset,
                                 right: mapOverlayInset,
                                 bottom: mapAdBottom,
                                 opacity: hideMapAd ? 0 : 1,
                               },
                             ]}
                           >
                             <AdBanner />
                           </View>
                           <View
                             style={[
                               styles.mapControls,
                               {
                                 right: mapOverlayInset,
                                 bottom: mapControlsBottom,
                               },
                             ]}
                           >
                             <TouchableOpacity
                               style={[
                                 styles.mapControlButton,
                                 { width: mapControlSize, height: mapControlSize, marginBottom: mapControlGap },
                               ]}
                               onPress={() => zoomMap(1)}
                             >
                               <MaterialCommunityIcons name="plus" size={getResponsiveFontSize(20)} color="white" />
                             </TouchableOpacity>
                             <TouchableOpacity
                               style={[
                                 styles.mapControlButton,
                                 { width: mapControlSize, height: mapControlSize, marginBottom: mapControlGap },
                               ]}
                               onPress={() => zoomMap(-1)}
                             >
                               <MaterialCommunityIcons name="minus" size={getResponsiveFontSize(20)} color="white" />
                             </TouchableOpacity>
                             <TouchableOpacity
                               style={[
                                 styles.mapControlButton,
                                 followHeading && styles.mapControlButtonActive,
                                 { width: mapControlSize, height: mapControlSize },
                               ]}
                               onPress={toggleHeadingMode}
                             >
                               <View style={{ transform: [{ rotate: compassRotation }] }}>
                                 <MaterialCommunityIcons
                                   name="navigation"
                                   size={getResponsiveFontSize(20)}
                                   color={followHeading ? '#0B1424' : 'white'}
                                 />
                               </View>
                             </TouchableOpacity>
                           </View>
                      </View>
                  )}
                  
                  {activeTab === 'Graphic' && (
                      <RadarGraphicView
                          totalDistance={totalDistance}
                          drivingStartTime={drivingStartTime}
                          currentSpeed={currentSpeed}
                          unitSystem={unitSystem}
                          radarRendererMode={radarRendererMode}
                          radarSignalLevel={radarSignalLevel}
                          radarDangerLevel={radarDangerLevel}
                      />
                  )}
              </View>

              {/* Floating Report Button */}
              <TouchableOpacity 
                style={[styles.fab, { bottom: floatingFabBottom }]}
                onPress={() => setReportModalVisible(true)}
              >
                  <MaterialCommunityIcons name="plus" size={32} color="white" />
              </TouchableOpacity>
              
              <Modal visible={reportModalVisible} transparent animationType="slide">
                   <BlurView intensity={20} style={StyleSheet.absoluteFill}>
                       <TouchableOpacity style={{flex:1}} onPress={() => setReportModalVisible(false)} />
                       <View style={styles.reportSheet}>
                           <Text style={styles.sheetTitle}>Report Hazard</Text>
                           <View style={{flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20}}>
                               <TouchableOpacity onPress={() => handleReportRadar('police')} style={{alignItems: 'center'}}>
                                   <View style={[styles.reportIconBig, {backgroundColor: '#FF5252'}]}>
                                       <MaterialCommunityIcons name="police-badge" size={30} color="white" />
                                   </View>
                                   <Text style={{color:'white', marginTop:8}}>Police</Text>
                               </TouchableOpacity>
                               <TouchableOpacity onPress={() => handleReportRadar('speed_camera')} style={{alignItems: 'center'}}>
                                   <View style={[styles.reportIconBig, {backgroundColor: '#2196F3'}]}>
                                       <MaterialCommunityIcons name="camera" size={30} color="white" />
                                   </View>
                                   <Text style={{color:'white', marginTop:8}}>Camera</Text>
                               </TouchableOpacity>
                           </View>
                       </View>
                   </BlurView>
              </Modal>
          </View>
      );
  }

  return (
    <RadarHomeDashboard
      styles={styles}
      insetsTop={insets.top}
      tabBarInset={tabBarInset}
      width={width}
      proSliderRef={proSliderRef}
      proSliderIndex={proSliderIndex}
      proFeatures={PRO_FEATURES}
      radarAuraSize={radarAuraSize}
      radarAnimationSize={radarAnimationSize}
      closestRadar={closestRadar}
      nearestRadarSummary={nearestRadarSummary}
      currentSpeed={currentSpeed}
      unitSystem={unitSystem}
      voicePlaybackEnabled={voicePlaybackEnabled}
      hasHydrated={hasHydrated}
      hapticAlertsEnabled={hapticAlertsEnabled}
      alertModeLabel={alertModeLabel}
      voiceWarningsEnabled={voiceWarningsEnabled}
      canUsePro={canUsePro}
      radarRendererMode={radarRendererMode}
      radarSignalLevel={radarSignalLevel}
      radarDangerLevel={radarDangerLevel}
      onOpenDrawer={() => navigation.openDrawer()}
      onOpenProfile={() => navigation.navigate('Profile')}
      onNavigateSubscription={() => navigation.navigate('Subscription')}
      onToggleDrivingMode={toggleDrivingMode}
      onToggleVoiceWarnings={toggleVoiceWarnings}
    />
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  
  // Header
  mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  appName: { color: '#F8FAFC', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', gap: 10 },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // Hero
  heroCard: { marginHorizontal: 16, marginTop: 6, marginBottom: 8, borderRadius: 22, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(12,18,32,0.92)' },
  heroGlowPrimary: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(78,205,196,0.18)', top: -40, right: -24 },
  heroGlowSecondary: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,82,82,0.08)', bottom: -50, left: -24 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  heroEyebrow: { color: '#38BDF8', fontSize: 12, letterSpacing: 1, fontWeight: '700', textTransform: 'uppercase' },
  heroTitle: { color: '#F8FAFC', fontSize: 22, fontWeight: '900', letterSpacing: 0.4, marginTop: 2 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4ECDC4', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, gap: 6, shadowColor: '#4ECDC4', shadowOpacity: 0.4, shadowRadius: 10, elevation: 4 },
  heroBadgeText: { color: '#0B1424', fontWeight: '900', letterSpacing: 0.5 },
  radarShell: { alignItems: 'center', justifyContent: 'center', marginTop: -8, marginBottom: 0 },
  radarAura: { position: 'absolute', backgroundColor: 'rgba(78,205,196,0.05)' },
  radarChip: { position: 'absolute', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(2,6,23,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  radarChipLeft: { top: 12, left: 14 },
  radarChipRight: { top: 12, right: 14 },
  radarChipText: { color: '#E2E8F0', marginLeft: 6, fontWeight: '600', fontSize: 12 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  statCard: { flex: 1, padding: 8, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  statIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  statLabel: { color: '#94A3B8', fontSize: 11, letterSpacing: 0.4 },
  statValue: { color: '#F8FAFC', fontWeight: '800', fontSize: 15 },
  statHint: { color: '#94A3B8', fontSize: 10, marginTop: 3, fontWeight: '600' },
  startButton: { marginTop: 6, borderRadius: 18, overflow: 'hidden', shadowColor: '#FF5252', shadowRadius: 16, shadowOpacity: 0.45, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  startButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  startText: { color: '#FFFFFF', fontWeight: '900', fontSize: 17, letterSpacing: 0.5 },
  startSubtext: { color: '#F8FAFC', opacity: 0.8, fontSize: 12, marginTop: 4 },
  startBadge: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },

  // Hero Actions & Voice Pill
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voicePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, gap: 5 },
  voicePillOn: { backgroundColor: '#4ECDC4' },
  voicePillOff: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  voicePillText: { fontSize: 12, fontWeight: '700' },
  voicePillTextOn: { color: '#0B1424' },
  voicePillTextOff: { color: '#E2E8F0' },

  // Pro Slider
  sliderContainer: { marginHorizontal: 16, marginTop: 0, marginBottom: 10, borderRadius: 18, overflow: 'hidden' },
  sliderGradient: { paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  proIconBox: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  pager: { flexDirection: 'row', justifyContent: 'center', marginTop: 15, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },

  // Driving Mode
  drivingHeader: { paddingBottom: 10, paddingHorizontal: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#000' },
  drivingModeTitle: { color: 'white', fontWeight: '900', fontSize: 16 },
  drivingModeSub: { color: '#4ECDC4', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  tabBar: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#111', marginHorizontal: 20, borderRadius: 12, padding: 4, marginBottom: 10 },
  tabItem: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8 },
  activeTabItem: { backgroundColor: '#222' },
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 12 },

  liveAlertBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveAlertIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,82,82,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveAlertTitle: { color: 'white', fontWeight: '700', fontSize: 13 },
  liveAlertSubtitle: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  liveAlertDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.1)',
  },
  
  // Navigation Progress Styles
  navigationProgress: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(78,205,196,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTitle: { color: 'white', fontWeight: '700', fontSize: 13 },
  progressSubtitle: { color: '#94A3B8', fontSize: 11, marginTop: 2, flex: 1 },
  progressDistance: { alignItems: 'center', justifyContent: 'center' },
  progressDistanceText: { color: '#4ECDC4', fontWeight: 'bold', fontSize: 12 },
  
  basicScroll: { flex: 1 },
  basicContainer: { alignItems: 'center', paddingTop: 20 },
  basicTopAdContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 12,
  },
  basicBottomAdContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  hudCircle: { width: 220, height: 220, borderRadius: 110, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#222', backgroundColor: '#111' },
  ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 4, borderColor: '#333' },
  speedText: { color: 'white', fontSize: 72, fontWeight: '900' },
  unitText: { color: '#666', fontSize: 16, fontWeight: 'bold', marginTop: -5 },
  
  alertsList: { width: '100%', padding: 20, marginTop: 20 },
  sectionHeader: { color: '#64748B', fontSize: 12, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
  alertItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 16, marginBottom: 10 },
  alertText: { color: 'white', flex: 1, marginLeft: 15, fontWeight: '500' },
  alertDist: { color: '#FFD700', fontWeight: 'bold' },

  // Map
  mapOverlay: { position: 'absolute', top: 20, left: 20, right: 20 },
  mapInput: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 15, borderRadius: 16, color: 'white' },
  mapControls: { position: 'absolute', alignItems: 'center', zIndex: 10 },
  mapControlButton: { borderRadius: 16, backgroundColor: 'rgba(15,23,42,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  mapControlButtonActive: { backgroundColor: '#4ECDC4', borderColor: '#4ECDC4' },
  mapAdContainer: { position: 'absolute', alignItems: 'center' },
  homeAdContainer: {
    marginHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
  },

  navCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(9,15,28,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.25)',
  },
  navCompactInfo: { flex: 1 },
  navCompactTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 14 },
  navCompactMeta: { color: '#94A3B8', marginTop: 2, fontSize: 11 },
  navCompactButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navCompactButtonDanger: {
    backgroundColor: 'rgba(255,82,82,0.9)',
    borderColor: 'rgba(255,82,82,0.9)',
  },

  fab: { position: 'absolute', left: 20, bottom: 85, backgroundColor: '#FF5252', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity:0.3, shadowRadius:4 },
  reportSheet: { backgroundColor: '#1E293B', padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  sheetTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  reportIconBig: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },

  suggestionsContainer: { backgroundColor: '#0F172A', borderRadius: 12, marginTop: 6, paddingVertical: 5, maxHeight: 220, borderWidth: 1, borderColor: 'rgba(148,163,184,0.2)', zIndex: 20, elevation: 8 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  suggestionText: { color: '#F8FAFC', marginLeft: 10, flex: 1 },
  
  bottomNavDock: { position: 'absolute', zIndex: 11 },
  navInstructionBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B1220', padding: 12, borderRadius: 14, marginTop: 8, borderWidth: 1, borderColor: 'rgba(78,205,196,0.35)' },
  navInstructionDock: { marginTop: 0, backgroundColor: 'rgba(11,18,32,0.96)' },
});

export default RadarScreen;
