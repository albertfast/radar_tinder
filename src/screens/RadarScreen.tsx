import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, useWindowDimensions, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import MapView from 'react-native-maps';
import { useRadarStore } from '../store/radarStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { RadarService } from '../services/RadarService';
import { OfflineService } from '../services/OfflineService';
import { SupabaseService } from '../services/SupabaseService';
import { LocationService } from '../services/LocationService';
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
  getUIScale,
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
  const setTabBarHidden = useUiStore((state) => state.setTabBarHidden);

  const mapRef = useRef<MapView | null>(null);
  const proSliderRef = useRef<FlatList>(null);
  const hasCenteredMapRef = useRef(false);
  const isInteractingRef = useRef(false);
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('Basic');
  const [proSliderIndex, setProSliderIndex] = useState(0);
  const [followHeading, setFollowHeading] = useState(true);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const currentLocationRef = useRef<any>(currentLocation);

  const mapInput = useMapInputState({ keyboardTraceEnabled: KEYBOARD_TRACE_ENABLED });

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

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
    isDriving: driving.isDriving,
    activeTab,
    followHeading,
    isTypingRef: mapInput.isTypingRef,
    isInteractingRef,
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
    logRouteSteps,
  });

  const { signalLevel: radarSignalLevel, dangerLevel: radarDangerLevel } = useRadarSignalLevels(
    dataSync.nearbyRadars,
    dataSync.closestRadar
  );
  const radarRendererMode: RadarRendererMode = 'auto';

  const uiScale = getUIScale();
  const mapOverlayInset = getResponsiveMargin(12);
  const mapOverlayTop = getResponsiveMargin(12);
  const mapControlSize = getResponsiveWidth(38);
  const mapControlGap = getResponsiveMargin(8);
  const isMapNavigationActive = driving.isDriving && activeTab === 'Map' && navigationState.routeCoords.length > 0;
  const mapControlsBottomBase = isMapNavigationActive
    ? Math.max(getResponsiveHeight(180), Math.round(height * 0.3))
    : Math.max(110, Math.round(height * 0.22));
  const mapNavDockBottom = isMapNavigationActive
    ? Math.max(getResponsiveHeight(70), mapOverlayInset + 48)
    : 0;
  const mapPadding = useMemo(() => ({
    top: isMapNavigationActive ? getResponsiveHeight(120) : getResponsiveHeight(160),
    right: mapOverlayInset,
    bottom: isMapNavigationActive ? getResponsiveHeight(320) : getResponsiveHeight(220),
    left: mapOverlayInset,
  }), [isMapNavigationActive, mapOverlayInset]);

  const bottomSafe = Math.max(insets.bottom, 10);
  const tabBarInset = TAB_BAR_HEIGHT + bottomSafe + 16;
  const mapAdBottom = Math.max(tabBarInset + 8, isMapNavigationActive ? mapNavDockBottom + getResponsiveHeight(84) : tabBarInset + 8);
  const mapAdEstimatedHeight = getResponsiveHeight(62);
  const mapControlsBottom = Math.max(mapControlsBottomBase, mapAdBottom + mapAdEstimatedHeight + mapControlGap + getResponsiveHeight(6));
  const floatingFabBottom = isMapNavigationActive
    ? Math.max(getResponsiveHeight(170), mapControlsBottom - mapControlSize - mapControlGap)
    : 85;
  const hideMapAd = mapInput.isDestinationInputFocused || mapInput.isKeyboardVisible;
  const compassRotation = dataSync.currentLocation?.heading != null ? `${dataSync.currentLocation.heading}deg` : '0deg';
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
    setTabBarHidden(driving.isDriving || activeTab === 'Map');
    return () => setTabBarHidden(false);
  }, [activeTab, driving.isDriving, setTabBarHidden]);

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
    if (!forceTab) return;
    const run = async () => {
      if (forceTab === 'Map' || forceTab === 'Graphic') {
        if (forceTab === 'Graphic' && !canUsePro) {
          setActiveTab('Basic');
          driving.resetDrivingSession();
        } else {
          await driving.startDrivingSession({ setActiveTab, activateMapTab: forceTab === 'Map', source: 'force_tab' });
          if (forceTab === 'Graphic') setActiveTab('Graphic');
        }
      } else {
        setActiveTab('Basic');
        driving.resetDrivingSession();
      }
      navigation.setParams?.({ forceTab: undefined });
    };
    run().catch(() => navigation.setParams?.({ forceTab: undefined }));
  }, [route?.params?.forceTab, canUsePro, driving, navigation]);

  const toggleDrivingMode = useCallback(async () => {
    if (!driving.isDriving) {
      await driving.startDrivingSession({ setActiveTab, activateMapTab: true, source: 'manual' });
      return;
    }
    await driving.stopDrivingSession({ setActiveTab, showInterstitial: true });
  }, [driving]);

  const centerMap = useCallback(() => {
    if (dataSync.currentLocation && mapRef.current) {
      mapRef.current.animateCamera({ center: { latitude: dataSync.currentLocation.latitude, longitude: dataSync.currentLocation.longitude }, zoom: 17, heading: followHeading ? dataSync.currentLocation.heading || 0 : 0, pitch: 60 }, { duration: 1000 });
      isInteractingRef.current = false;
    }
  }, [dataSync.currentLocation, followHeading]);

  const markInteracting = useCallback(() => {
    isInteractingRef.current = true;
    if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = setTimeout(() => {
      if (!mapInput.isTypingRef.current) isInteractingRef.current = false;
    }, 2000);
  }, [mapInput.isTypingRef]);

  const handleMapTap = useCallback(() => {
    if (Date.now() - mapInput.lastDestinationFocusAtRef.current < 1200) return;
    if (mapInput.isDestinationInputFocused || mapInput.isKeyboardVisible || mapInput.isTypingRef.current) return;
    navigationState.setSuggestions([]);
  }, [mapInput, navigationState]);

  const exitDrivingToHome = useCallback(async () => {
    await navigationState.resetRoute();
    navigation.getParent?.()?.navigate('Home');
  }, [navigation, navigationState]);

  const onReportRadar = useCallback(async (type: RadarLocation['type']) => {
    setReportModalVisible(false);
    if (!user) return alert('Please log in to report hazards.');
    const loc = dataSync.currentLocationRef.current || await LocationService.getCurrentLocation().catch(() => null);
    if (!loc) return alert('Location unavailable. Please enable location services.');
    try {
      await RadarService.reportRadarLocation({ latitude: loc.latitude, longitude: loc.longitude, type, confidence: 0.7, lastConfirmed: new Date(), reportedBy: user.id });
      const refreshed = await RadarService.getNearbyRadars(loc.latitude, loc.longitude, 10);
      dataSync.updateNearbyRadarsState(refreshed);
      await refreshProfile();
      alert('Report sent. Nearby drivers will be notified.');
    } catch {
      try {
        await OfflineService.saveRadarLocationOffline({ id: `offline-${Date.now()}`, latitude: loc.latitude, longitude: loc.longitude, type, confidence: 0.7, lastConfirmed: new Date(), reportedBy: user.id, createdAt: new Date(), updatedAt: new Date() } as any);
        alert('Saved offline. Will sync when online.');
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
        routeCoords={navigationState.routeCoords}
        routeMetaDestinationLabel={navigationState.routeMeta?.destinationLabel}
        navInstruction={navigationState.navSteps[navigationState.currentStepIndex]?.instruction}
        navDistanceLabel={formatStepDistance(navigationState.getStepDistanceMeters(navigationState.navSteps[navigationState.currentStepIndex]), unitSystem)}
        basicContent={<RadarBasicTab currentSpeed={dataSync.currentSpeed} unitSystem={unitSystem} nearbyRadars={dataSync.nearbyRadars} tabBarInset={tabBarInset} />}
        mapContent={<RadarMapTab currentLocation={dataSync.currentLocation} nearbyRadars={dataSync.nearbyRadars} routeCoords={navigationState.routeCoords} mapRef={mapRef} destinationCoord={navigationState.destinationCoord} mapPadding={mapPadding} isMapInputLockActive={mapInput.isMapInputLockActive} onRadarPress={onRadarPress} handleMapTouchStart={() => !mapInput.isMapInputLockActive && markInteracting()} endInteracting={() => !mapInput.isTypingRef.current && (isInteractingRef.current = false)} handleMapTap={handleMapTap} mapOverlayTop={mapOverlayTop} mapOverlayInset={mapOverlayInset} mapControlGap={mapControlGap} destinationInputRef={mapInput.destinationInputRef} destination={navigationState.destination} handleTextChange={navigationState.handleTextChange} handleNavigate={() => navigationState.handleNavigate()} onClearDestination={() => { navigationState.setDestination(''); navigationState.setSuggestions([]); }} centerMap={centerMap} suggestions={navigationState.suggestions} handleSelectSuggestion={navigationState.handleSelectSuggestion} recentDestinations={navigationState.recentDestinations} handleInputPressIn={mapInput.handleInputPressIn} handleInputFocus={mapInput.handleInputFocus} handleInputBlur={mapInput.handleInputBlur} isMapNavigationActive={isMapNavigationActive} routeMeta={navigationState.routeMeta} navSteps={navigationState.navSteps} currentStepIndex={navigationState.currentStepIndex} formatStepDistance={(m) => formatStepDistance(m, unitSystem)} getStepDistanceMeters={navigationState.getStepDistanceMeters} getManeuverIcon={getManeuverIcon} uiScale={uiScale} mapNavDockBottom={mapNavDockBottom} hideMapAd={hideMapAd} mapAdBottom={mapAdBottom} mapControlsBottom={mapControlsBottom} mapControlSize={mapControlSize} followHeading={followHeading} compassRotation={compassRotation} zoomMap={async (d) => { if (!mapRef.current) return; try { const c = await mapRef.current.getCamera(); mapRef.current.animateCamera({ zoom: Math.max(2, Math.min(20, (typeof c.zoom === 'number' ? c.zoom : 17) + d)) }, { duration: 200 }); markInteracting(); } catch {} }} toggleHeadingMode={() => { markInteracting(); setFollowHeading((prev) => { const next = !prev; mapRef.current?.animateCamera({ heading: next ? dataSync.currentLocation?.heading || 0 : 0 }, { duration: 300 }); return next; }); }} resetRoute={navigationState.resetRoute} setSuggestions={navigationState.setSuggestions} />}
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
      onToggleVoiceWarnings={toggleVoiceWarnings}
    />
  );
};
export default RadarScreen;
