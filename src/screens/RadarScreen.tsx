import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, useWindowDimensions, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import MapView from 'react-native-maps';
import { useIsFocused } from '@react-navigation/native';
import { useRadarStore } from '../store/radarStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { RadarService } from '../services/RadarService';
import { OfflineService } from '../services/OfflineService';
import { SupabaseService } from '../services/SupabaseService';
import { LocationService } from '../services/LocationService';
import { AdService } from '../services/AdService';
import { AnalyticsService } from '../services/AnalyticsService';
import { formatDistance } from '../utils/format';
import { hasProAccess } from '../utils/access';
import { RadarAlert, RadarLocation } from '../types';
import { RadarGraphicView } from './components/RadarGraphicView';
import { RadarHomeDashboard } from './radar/components/RadarHomeDashboard';
import { useRouteTrace } from './radar/hooks/useRouteTrace';
import { useVoiceMode } from './radar/hooks/useVoiceMode';
import { useRadarSignalLevels } from './radar/hooks/useRadarSignalLevels';
import { RadarRendererMode } from '../components/RadarAnimation';
import {
  TAB_BAR_HEIGHT,
  getResponsiveHeight,
  getResponsiveMargin,
  getResponsiveWidth,
} from '../constants/layout';
import { PRO_FEATURES, KEYBOARD_TRACE_ENABLED } from './radar/constants';
import { TabType } from './radar/types';
import { formatStepDistance, getManeuverIcon, canConfirmRadar } from './radar/utils/radarFormatters';
import { radarScreenStyles as styles } from './radar/styles/radarScreenStyles';
import { RadarDrivingShell } from './radar/components/driving/RadarDrivingShell';
import { RadarBasicTab } from './radar/components/driving/RadarBasicTab';
import { RadarMapTab } from './radar/components/driving/RadarMapTab';
import { useMapInputState } from './radar/hooks/useMapInputState';
import { useDrivingSession } from './radar/hooks/useDrivingSession';
import { useRadarDataSync } from './radar/hooks/useRadarDataSync';
import { useRadarNavigation } from './radar/hooks/useRadarNavigation';
const MAP_INPUT_TAP_GUARD_MS = 2200;

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

const sliceRouteAroundIndexByDistance = (
  coords: Array<{ latitude: number; longitude: number }>,
  centerIndex: number,
  behindMeters: number,
  aheadMeters: number
) => {
  if (!Array.isArray(coords) || coords.length < 2) return coords;

  let start = Math.min(Math.max(centerIndex, 0), coords.length - 1);
  let traveledBehind = 0;
  while (start > 0 && traveledBehind < behindMeters) {
    const from = coords[start];
    const to = coords[start - 1];
    traveledBehind +=
      LocationService.calculateDistanceSync(from.latitude, from.longitude, to.latitude, to.longitude) * 1000;
    start -= 1;
  }

  let end = Math.min(Math.max(centerIndex, 0), coords.length - 1);
  let traveledAhead = 0;
  while (end < coords.length - 1 && traveledAhead < aheadMeters) {
    const from = coords[end];
    const to = coords[end + 1];
    traveledAhead +=
      LocationService.calculateDistanceSync(from.latitude, from.longitude, to.latitude, to.longitude) * 1000;
    end += 1;
  }

  const segment = coords.slice(start, end + 1);
  return segment.length > 1 ? segment : coords.slice(Math.max(0, start - 1), Math.min(coords.length, end + 2));
};

const RadarScreen = ({ navigation, route }: any) => {
  const { user, refreshProfile, normalizeAccessState } = useAuthStore();
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
  const setActiveAlerts = useRadarStore((state) => state.setActiveAlerts);
  const acknowledgeAlert = useRadarStore((state) => state.acknowledgeAlert);
  const setRouteGuidanceActive = useRadarStore((state) => state.setRouteGuidanceActive);
  const setRouteGuidancePath = useRadarStore((state) => state.setRouteGuidancePath);
  const hideTabBar = useUiStore((state) => state.hideTabBar);
  const showTabBar = useUiStore((state) => state.showTabBar);

  const mapRef = useRef<MapView | null>(null);
  const proSliderRef = useRef<FlatList>(null);
  const hasCenteredMapRef = useRef(false);
  const forceTabRequestRef = useRef<string | null>(null);
  const adsVisibilityReasonRef = useRef('');

  const { width, height } = useWindowDimensions();
  const isScreenFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('Basic');
  const [proSliderIndex, setProSliderIndex] = useState(0);
  const [followHeading, setFollowHeading] = useState(true);
  const [manualPanMode, setManualPanMode] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [routeRenderStartIndex, setRouteRenderStartIndex] = useState(0);
  const currentLocationRef = useRef<any>(currentLocation);
  const manualPanModeRef = useRef(manualPanMode);
  const routeRenderStartIndexRef = useRef(0);

  const mapInput = useMapInputState({ keyboardTraceEnabled: KEYBOARD_TRACE_ENABLED });

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    manualPanModeRef.current = manualPanMode;
  }, [manualPanMode]);

  const { voicePlaybackEnabled, alertModeLabel, toggleVoiceWarnings } = useVoiceMode({
    hasHydrated,
    voiceWarningsEnabled,
    hapticAlertsEnabled,
    warningVolume,
    setVoiceWarningsEnabled,
    setWarningVolume,
  });

  const driving = useDrivingSession({
    user,
    currentLocation,
    currentLocationRef,
  });

  const dataSync = useRadarDataSync({
    currentLocation,
    setCurrentLocation,
    currentLocationRef,
    mapRef,
    allowUiLocationUpdates: isScreenFocused || driving.isDriving,
    isDriving: driving.isDriving,
    activeTab,
    followHeading,
    isTypingRef: mapInput.isTypingRef,
    manualPanModeRef,
    hasCenteredMapRef,
    activeAlerts: activeAlerts as RadarAlert[],
    hasHydrated,
    hapticAlertsEnabled,
    voicePlaybackEnabled,
    warningVolume,
    unitSystem,
    setRadarLocations,
  });

  const { logRouteSteps } = useRouteTrace();
  const getCurrentSpeedKph = useCallback(() => dataSync.currentSpeed, [dataSync.currentSpeed]);
  const navigationState = useRadarNavigation({
    canUsePro,
    mapRef,
    hasCenteredMapRef,
    currentLocation,
    setCurrentLocation,
    currentLocationRef,
    isDriving: driving.isDriving,
    setTotalDistance: driving.setTotalDistance,
    lastPositionRef: driving.lastPositionRef,
    startDrivingSession: driving.startDrivingSession,
    saveTripIfNeeded: driving.saveTripIfNeeded,
    resetDrivingSession: driving.resetDrivingSession,
    setActiveTab,
    resetSpeed: dataSync.resetSpeed,
    setNearbyRadars: dataSync.setNearbyRadars,
    updateNearbyRadarsState: dataSync.updateNearbyRadarsState,
    dismissDestinationInput: mapInput.dismissDestinationInput,
    setDestinationInputFocused: mapInput.setDestinationInputFocused,
    isTypingRef: mapInput.isTypingRef,
    getCurrentSpeedKph,
    logRouteSteps,
  });

  const { signalLevel: radarSignalLevel, dangerLevel: radarDangerLevel } = useRadarSignalLevels(
    dataSync.nearbyRadars,
    dataSync.closestRadar
  );
  const radarRendererMode = useMemo<RadarRendererMode>(() => {
    const configured = (process.env.EXPO_PUBLIC_RADAR_RENDERER || 'auto').trim().toLowerCase();
    if (configured === 'life3d' || configured === 'legacy2d' || configured === 'auto') {
      return configured;
    }
    return 'auto';
  }, []);

  const mapOverlayInset = getResponsiveMargin(12);
  const mapOverlayTop = getResponsiveMargin(12);
  const mapControlSize = getResponsiveWidth(38);
  const mapControlGap = getResponsiveMargin(8);
  const suppressMapAds = true;
  const isTurnByTurnActive = driving.isDriving && navigationState.routeCoords.length > 0;
  const isMapNavigationActive = isTurnByTurnActive && activeTab === 'Map';
  const mapControlsBottomBase = isMapNavigationActive
    ? Math.max(getResponsiveHeight(196), Math.round(height * 0.34))
    : Math.max(110, Math.round(height * 0.22));
  const mapNavDockBottom = isMapNavigationActive
    ? Math.max(getResponsiveHeight(70), mapOverlayInset + 48)
    : 0;
  const mapPadding = useMemo(() => ({
    top: isMapNavigationActive ? getResponsiveHeight(120) : getResponsiveHeight(160),
    right: mapOverlayInset,
    bottom: isMapNavigationActive ? getResponsiveHeight(280) : getResponsiveHeight(220),
    left: mapOverlayInset,
  }), [isMapNavigationActive, mapOverlayInset]);

  const bottomSafe = Math.max(insets.bottom, 10);
  const tabBarInset = TAB_BAR_HEIGHT + bottomSafe + 16;
  const mapAdBottom = Math.max(tabBarInset + 8, isMapNavigationActive ? mapNavDockBottom + getResponsiveHeight(84) : tabBarInset + 8);
  const mapAdEstimatedHeight = suppressMapAds ? 0 : getResponsiveHeight(62);
  const mapControlsBottom = Math.max(mapControlsBottomBase, mapAdBottom + mapAdEstimatedHeight + mapControlGap + getResponsiveHeight(6));
  const fabGap = getResponsiveHeight(12);
  const floatingFabBottom = isMapNavigationActive
    ? Math.max(getResponsiveHeight(170), mapControlsBottom - mapControlSize - mapControlGap)
    : mapAdBottom + mapAdEstimatedHeight + fabGap;
  const hideMapAd = mapInput.isDestinationInputFocused || mapInput.isKeyboardVisible;
  const compassRotation = `${dataSync.resolvedHeading || 0}deg`;
  const showCenterRouteAction =
    (manualPanMode || !followHeading) && navigationState.routeCoords.length > 0;
  const routeCoordsForMap = useMemo(() => {
    if (routeRenderStartIndex <= 0) return navigationState.routeCoords;
    if (routeRenderStartIndex >= navigationState.routeCoords.length - 1) {
      return navigationState.routeCoords.slice(-2);
    }
    return navigationState.routeCoords.slice(routeRenderStartIndex);
  }, [navigationState.routeCoords, routeRenderStartIndex]);
  const nearestRadarSummary = dataSync.closestRadar
    ? (dataSync.closestRadarHint ? `${formatDistance(dataSync.closestRadar.distance, unitSystem)} at ${dataSync.closestRadarHint}` : formatDistance(dataSync.closestRadar.distance, unitSystem))
    : 'Scanning...';

  useEffect(() => {
    if (driving.isDriving && keepAwakeWhileDriving) activateKeepAwakeAsync().catch(() => {});
    else deactivateKeepAwake();
    return () => {
      deactivateKeepAwake();
    };
  }, [driving.isDriving, keepAwakeWhileDriving]);

  useEffect(() => {
    if (driving.isDriving || activeTab === 'Map') {
      hideTabBar('driving_mode');
      return () => showTabBar('driving_mode');
    }
    showTabBar('driving_mode');
    return () => showTabBar('driving_mode');
  }, [activeTab, driving.isDriving, hideTabBar, showTabBar]);

  useEffect(() => {
    if (!isScreenFocused) return;
    normalizeAccessState().catch(() => {});
  }, [isScreenFocused, normalizeAccessState]);

  useEffect(() => {
    AdService.markDrivingState(driving.isDriving, isTurnByTurnActive);
    return () => AdService.markDrivingState(false, false);
  }, [driving.isDriving, isTurnByTurnActive]);

  useEffect(() => {
    const adsDebug = AdService.getAdsDebugState();
    const signature = `${adsDebug.shouldShowReason}|${adsDebug.shouldShowAds ? 1 : 0}`;
    if (adsVisibilityReasonRef.current === signature) return;
    adsVisibilityReasonRef.current = signature;

    AnalyticsService.trackEvent('ads_visibility_reason', {
      reason: adsDebug.shouldShowReason,
      visible: adsDebug.shouldShowAds,
      route_active: isTurnByTurnActive,
      tab: activeTab,
    }).catch(() => {});
  }, [
    activeTab,
    isTurnByTurnActive,
    user?.adsRemoved,
    user?.isAdminSession,
    user?.subscriptionType,
  ]);

  useEffect(() => {
    setRouteGuidanceActive(isTurnByTurnActive);
    return () => setRouteGuidanceActive(false);
  }, [isTurnByTurnActive, setRouteGuidanceActive]);

  useEffect(() => {
    setRouteGuidancePath(navigationState.routeCoords || []);
    return () => setRouteGuidancePath([]);
  }, [navigationState.routeCoords, setRouteGuidancePath]);

  useEffect(() => {
    routeRenderStartIndexRef.current = 0;
    setRouteRenderStartIndex(0);
  }, [navigationState.destinationCoord?.latitude, navigationState.destinationCoord?.longitude]);

  useEffect(() => {
    const route = navigationState.routeCoords;
    const loc = dataSync.currentLocation;
    if (!loc || route.length < 3) {
      if (routeRenderStartIndexRef.current !== 0) {
        routeRenderStartIndexRef.current = 0;
        setRouteRenderStartIndex(0);
      }
      return;
    }

    const previous = Math.min(routeRenderStartIndexRef.current, route.length - 1);
    let searchFrom = 0;
    let searchTo = route.length - 1;
    if (route.length > 120) {
      searchFrom = Math.max(0, previous - 80);
      searchTo = Math.min(route.length - 1, previous + 260);
    }

    let bestIndex = previous;
    let bestDistanceMeters = Number.POSITIVE_INFINITY;
    const scanRange = (from: number, to: number) => {
      for (let index = from; index <= to; index += 1) {
        const point = route[index];
        const distanceMeters =
          LocationService.calculateDistanceSync(loc.latitude, loc.longitude, point.latitude, point.longitude) * 1000;
        if (distanceMeters < bestDistanceMeters) {
          bestDistanceMeters = distanceMeters;
          bestIndex = index;
          if (distanceMeters <= 4) break;
        }
      }
    };

    scanRange(searchFrom, searchTo);
    if (bestDistanceMeters > 95 && (searchFrom > 0 || searchTo < route.length - 1)) {
      scanRange(0, route.length - 1);
    }

    const nextStart = Math.max(0, bestIndex - 1);
    const currentStart = routeRenderStartIndexRef.current;
    const shouldAdvance = nextStart > currentStart;
    const shouldRewind = nextStart + 22 < currentStart;
    if (!shouldAdvance && !shouldRewind) return;

    routeRenderStartIndexRef.current = nextStart;
    setRouteRenderStartIndex(nextStart);
  }, [dataSync.currentLocation, navigationState.routeCoords]);

  useEffect(() => {
    if (driving.isDriving) return;
    setActiveAlerts([]);
  }, [driving.isDriving, setActiveAlerts]);

  useEffect(() => {
    if (!driving.isDriving) return;
    setFollowHeading(true);
    setManualPanMode(false);
  }, [driving.isDriving]);

  useEffect(() => {
    if (navigationState.routeCoords.length < 2) return;
    // New or updated route should restore follow mode automatically.
    setFollowHeading(true);
    setManualPanMode(false);
  }, [navigationState.routeCoords.length]);

  useEffect(() => {
    if (driving.isDriving) return;
    const interval = setInterval(() => {
      const next = (proSliderIndex + 1) % PRO_FEATURES.length;
      setProSliderIndex(next);
      proSliderRef.current?.scrollToIndex({ index: next, animated: true, viewPosition: 0.5 });
    }, 4000);
    return () => clearInterval(interval);
  }, [driving.isDriving, proSliderIndex]);

  useEffect(() => {
    const forceTab = route?.params?.forceTab as TabType | undefined;
    if (!forceTab) {
      forceTabRequestRef.current = null;
      return;
    }
    if (forceTabRequestRef.current === forceTab) return;
    forceTabRequestRef.current = forceTab;
    let cancelled = false;
    const run = async () => {
      if (forceTab === 'Map' || forceTab === 'Graphic' || forceTab === 'Basic') {
        if (forceTab === 'Graphic' && !canUsePro) {
          setActiveTab('Basic');
          driving.resetDrivingSession();
        } else {
          await driving.startDrivingSession({
            setActiveTab,
            activateMapTab: forceTab === 'Map',
            source: 'force_tab',
          });
          if (forceTab === 'Graphic') {
            setActiveTab('Graphic');
          } else if (forceTab === 'Basic') {
            setActiveTab('Basic');
          }
        }
      } else {
        setActiveTab('Basic');
        driving.resetDrivingSession();
      }
      if (!cancelled) {
        forceTabRequestRef.current = null;
        navigation.setParams?.({ forceTab: undefined });
      }
    };
    run().catch(() => {
      forceTabRequestRef.current = null;
      if (!cancelled) {
        navigation.setParams?.({ forceTab: undefined });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [route?.params?.forceTab, canUsePro, driving.resetDrivingSession, driving.startDrivingSession, navigation]);

  const toggleDrivingMode = useCallback(async () => {
    if (!driving.isDriving) {
      await driving.startDrivingSession({
        setActiveTab,
        activateMapTab: true,
        source: 'manual',
        hasActiveRoute: navigationState.routeCoords.length > 0,
      });
      return;
    }
    await driving.stopDrivingSession({ setActiveTab });
  }, [driving, navigationState.routeCoords.length]);

  const centerMap = useCallback(async () => {
    let location = dataSync.currentLocation;
    if (!location) {
      const fallback = await LocationService.getCurrentLocation().catch(() => null);
      if (!fallback) return;
      location = {
        latitude: fallback.latitude,
        longitude: fallback.longitude,
        heading: 0,
      };
      setCurrentLocation(location);
    }
    if (!mapRef.current) return;

    const hasLiveHeading =
      typeof dataSync.resolvedHeading === 'number' && Number.isFinite(dataSync.resolvedHeading)
        ? true
        : typeof location.heading === 'number' && Number.isFinite(location.heading);
    let headingForCenter =
      typeof dataSync.resolvedHeading === 'number' && Number.isFinite(dataSync.resolvedHeading)
        ? dataSync.resolvedHeading
        : typeof location.heading === 'number' && Number.isFinite(location.heading)
          ? location.heading
          : 0;

    if (navigationState.routeCoords.length > 1 && !hasLiveHeading) {
      let closestIndex = 0;
      let minDistanceKm = Number.POSITIVE_INFINITY;
      for (let index = 0; index < navigationState.routeCoords.length; index += 1) {
        const coord = navigationState.routeCoords[index];
        const distanceKm = LocationService.calculateDistanceSync(
          location.latitude,
          location.longitude,
          coord.latitude,
          coord.longitude
        );
        if (distanceKm < minDistanceKm) {
          minDistanceKm = distanceKm;
          closestIndex = index;
        }
      }
      const nextIndex = Math.min(navigationState.routeCoords.length - 1, closestIndex + 1);
      if (nextIndex !== closestIndex) {
        const nextCoord = navigationState.routeCoords[nextIndex];
        headingForCenter = LocationService.calculateBearing(
          location.latitude,
          location.longitude,
          nextCoord.latitude,
          nextCoord.longitude
        );
      }
    }

    const lookAheadMeters = navigationState.routeCoords.length > 1 ? 78 : 54;
    const followCenter = projectForwardCoordinate(
      location.latitude,
      location.longitude,
      headingForCenter,
      lookAheadMeters
    );

    setManualPanMode(false);
    setFollowHeading(true);
    mapRef.current.animateCamera(
      {
        center: {
          latitude: followCenter.latitude,
          longitude: followCenter.longitude,
        },
        zoom: 19.14,
        heading: headingForCenter,
        pitch: 62,
      },
      { duration: 340 }
    );
  }, [dataSync.currentLocation, dataSync.resolvedHeading, navigationState.routeCoords, setCurrentLocation]);

  const centerRoute = useCallback(() => {
    if (!mapRef.current) return;

    if (navigationState.routeCoords.length > 1) {
      setManualPanMode(false);
      setFollowHeading(true);
      const currentLoc = dataSync.currentLocation;
      let focusCoords = navigationState.routeCoords.slice(0, Math.min(navigationState.routeCoords.length, 20));
      if (currentLoc) {
        let closestIndex = 0;
        let minDistanceKm = Number.POSITIVE_INFINITY;
        for (let index = 0; index < navigationState.routeCoords.length; index += 1) {
          const coord = navigationState.routeCoords[index];
          const distanceKm = LocationService.calculateDistanceSync(
            currentLoc.latitude,
            currentLoc.longitude,
            coord.latitude,
            coord.longitude
          );
          if (distanceKm < minDistanceKm) {
            minDistanceKm = distanceKm;
            closestIndex = index;
          }
        }
        const nearbySegment = sliceRouteAroundIndexByDistance(
          navigationState.routeCoords,
          closestIndex,
          260,
          1100
        );
        if (nearbySegment.length > 1) {
          focusCoords = nearbySegment;
        }
      }
      try {
        mapRef.current.fitToCoordinates(focusCoords, {
          edgePadding: {
            top: getResponsiveHeight(112),
            right: mapOverlayInset,
            bottom: getResponsiveHeight(238),
            left: mapOverlayInset,
          },
          animated: true,
        });
      } catch {}
      setTimeout(() => {
        centerMap();
      }, 320);
      return;
    }

    centerMap();
  }, [centerMap, dataSync.currentLocation, mapOverlayInset, navigationState.routeCoords]);

  const handleMapTouchStart = useCallback(() => {
    if (mapInput.isMapInputLockActive) return;
    setManualPanMode(true);
    setFollowHeading(false);
  }, [mapInput.isMapInputLockActive]);

  const handleMapTap = useCallback(() => {
    if (Date.now() - mapInput.lastDestinationFocusAtRef.current < MAP_INPUT_TAP_GUARD_MS) return;
    if (mapInput.isDestinationInputFocused || mapInput.isKeyboardVisible || mapInput.isTypingRef.current) {
      mapInput.dismissDestinationInput(() => {
        navigationState.setSuggestions([]);
      });
      return;
    }
    if (navigationState.suggestions.length > 0) {
      navigationState.setSuggestions([]);
    }
  }, [mapInput, navigationState]);

  const exitDrivingToHome = useCallback(async () => {
    await navigationState.resetRoute();
    navigation.getParent?.()?.navigate('Home');
  }, [navigation, navigationState]);

  const onReportRadar = useCallback(async (type: RadarLocation['type'], reportTag: 'default' | 'missed_camera' = 'default') => {
    setReportModalVisible(false);
    if (!user) return alert('Please log in to report hazards.');
    const loc = dataSync.currentLocationRef.current || await LocationService.getCurrentLocation().catch(() => null);
    if (!loc) return alert('Location unavailable. Please enable location services.');
    try {
      await RadarService.reportRadarLocation({
        latitude: loc.latitude,
        longitude: loc.longitude,
        type,
        confidence: reportTag === 'missed_camera' ? 0.75 : 0.7,
        lastConfirmed: new Date(),
        reportedBy: user.id,
      });
      const refreshed = await RadarService.getNearbyRadars(loc.latitude, loc.longitude, 10);
      dataSync.updateNearbyRadarsState(refreshed);
      await refreshProfile();
      alert(
        reportTag === 'missed_camera'
          ? 'Missed camera feedback sent. We will use it to improve trap coverage.'
          : 'Report sent. Nearby drivers will be notified.'
      );
    } catch {
      try {
        await OfflineService.saveRadarLocationOffline({ id: `offline-${Date.now()}`, latitude: loc.latitude, longitude: loc.longitude, type, confidence: 0.7, lastConfirmed: new Date(), reportedBy: user.id, createdAt: new Date(), updatedAt: new Date() } as any);
        alert(
          reportTag === 'missed_camera'
            ? 'Missed camera feedback saved offline. It will sync when online.'
            : 'Saved offline. Will sync when online.'
        );
      } catch {
        alert('Failed to report hazard. Please try again.');
      }
    }
  }, [dataSync, refreshProfile, user]);

  const onRadarPress = useCallback(async (radar: RadarLocation) => {
    if (!canConfirmRadar(radar)) return;
    if (!user) return alert('Please log in to confirm reports.');
    const loc = dataSync.currentLocationRef.current || dataSync.currentLocation;
    if (!loc) return alert('Location unavailable. Please enable location services.');
    const reportId = await SupabaseService.confirmNearbyReport({ latitude: loc.latitude, longitude: loc.longitude, radiusMeters: 150, type: radar.type });
    if (reportId) {
      await refreshProfile();
      alert('Thanks! Confirmation recorded.');
    } else {
      alert('No community report to confirm nearby.');
    }
  }, [dataSync.currentLocation, dataSync.currentLocationRef, refreshProfile, user]);

  if (driving.isDriving) {
    return (
      <RadarDrivingShell
        insetsTop={insets.top}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        canUsePro={canUsePro}
        onOpenSubscription={() => navigation.navigate('Subscription')}
        onExitHome={exitDrivingToHome}
        onOpenSettings={() => navigation.navigate('RadarSettings')}
        isMapNavigationActive={isMapNavigationActive}
        activeAlert={dataSync.activeAlert}
        unitSystem={unitSystem}
        acknowledgeAlert={acknowledgeAlert}
        routeCoords={routeCoordsForMap}
        routeMetaDestinationLabel={navigationState.routeMeta?.destinationLabel}
        navInstruction={navigationState.navSteps[navigationState.currentStepIndex]?.instruction}
        navDistanceLabel={formatStepDistance(
          navigationState.getStepDistanceMeters(navigationState.navSteps[navigationState.currentStepIndex]),
          unitSystem
        )}
        hasArrived={navigationState.hasArrived}
        onEndTrip={navigationState.resetRoute}
        basicContent={
          <RadarBasicTab
            currentSpeed={dataSync.currentSpeed}
            unitSystem={unitSystem}
            nearbyRadars={dataSync.nearbyRadars}
            tabBarInset={tabBarInset}
            currentLocation={dataSync.currentLocation}
          />
        }
        mapContent={
          <RadarMapTab
            currentLocation={dataSync.currentLocation}
            nearbyRadars={dataSync.nearbyRadars}
            routeCoords={routeCoordsForMap}
            mapRef={mapRef}
            destinationCoord={navigationState.destinationCoord}
            mapPadding={mapPadding}
            isMapInputLockActive={mapInput.isMapInputLockActive}
            onRadarPress={onRadarPress}
            handleMapTouchStart={handleMapTouchStart}
            handleMapTap={handleMapTap}
            mapOverlayTop={mapOverlayTop}
            mapOverlayInset={mapOverlayInset}
            mapControlGap={mapControlGap}
            destinationInputRef={mapInput.destinationInputRef}
            destination={navigationState.destination}
            handleTextChange={navigationState.handleTextChange}
            handleNavigate={() => navigationState.handleNavigate()}
            onClearDestination={() => {
              navigationState.setDestination('');
              navigationState.setSuggestions([]);
            }}
            centerMap={centerMap}
            suggestions={navigationState.suggestions}
            handleSelectSuggestion={navigationState.handleSelectSuggestion}
            recentDestinations={navigationState.recentDestinations}
            handleInputPressIn={mapInput.handleInputPressIn}
            handleInputFocus={mapInput.handleInputFocus}
            handleInputBlur={mapInput.handleInputBlur}
            isMapNavigationActive={isMapNavigationActive}
            routeMeta={navigationState.routeMeta}
            navSteps={navigationState.navSteps}
            currentStepIndex={navigationState.currentStepIndex}
            formatStepDistance={(m) => formatStepDistance(m, unitSystem)}
            getStepDistanceMeters={navigationState.getStepDistanceMeters}
            getManeuverIcon={getManeuverIcon}
            mapNavDockBottom={mapNavDockBottom}
            hideMapAd={hideMapAd || suppressMapAds}
            mapAdBottom={mapAdBottom}
            mapControlsBottom={mapControlsBottom}
            mapControlSize={mapControlSize}
            followHeading={followHeading && !manualPanMode}
            compassRotation={compassRotation}
            zoomMap={async (d) => {
              if (!mapRef.current) return;
              try {
                const c = await mapRef.current.getCamera();
                mapRef.current.animateCamera(
                  {
                    zoom: Math.max(2, Math.min(20, (typeof c.zoom === 'number' ? c.zoom : 17) + d)),
                  },
                  { duration: 200 }
                );
                setManualPanMode(true);
                setFollowHeading(false);
              } catch {}
            }}
            resumeFollowMode={centerMap}
            onCenterRoute={centerRoute}
            showCenterRouteAction={showCenterRouteAction}
            arrivalState={navigationState.arrivalState}
            distanceToDestinationMeters={navigationState.distanceToDestinationMeters}
            hasArrived={navigationState.hasArrived}
            onEndTrip={navigationState.resetRoute}
            suppressAds={suppressMapAds || isTurnByTurnActive}
            resetRoute={navigationState.resetRoute}
            setSuggestions={navigationState.setSuggestions}
            voiceWarningsEnabled={voiceWarningsEnabled}
            onToggleVoiceWarnings={toggleVoiceWarnings}
            onOpenIncidentPanel={() => setReportModalVisible(true)}
            currentSpeed={dataSync.currentSpeed}
            unitSystem={unitSystem}
          />
        }
        graphicContent={<RadarGraphicView totalDistance={driving.totalDistance} drivingStartTime={driving.drivingStartTime} currentSpeed={dataSync.currentSpeed} unitSystem={unitSystem} radarRendererMode={radarRendererMode} radarSignalLevel={radarSignalLevel} radarDangerLevel={radarDangerLevel} />}
        floatingFabBottom={floatingFabBottom}
        reportModalVisible={reportModalVisible}
        setReportModalVisible={setReportModalVisible}
        onReportRadar={onReportRadar}
      />
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
      radarAuraSize={Math.round(Math.max(176, Math.min(Math.round(width * 0.58), 290)) * 0.78)}
      radarAnimationSize={Math.max(176, Math.min(Math.round(width * 0.58), 290))}
      closestRadar={dataSync.closestRadar}
      nearestRadarSummary={nearestRadarSummary}
      currentSpeed={dataSync.currentSpeed}
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
      onOpenDriveBasic={() => {
        navigation.setParams?.({ forceTab: 'Basic' });
      }}
      onOpenAlerts={() => navigation.navigate('Alerts')}
      onToggleVoiceWarnings={toggleVoiceWarnings}
      pauseRadarAnimation={false}
    />
  );
};
export default RadarScreen;
