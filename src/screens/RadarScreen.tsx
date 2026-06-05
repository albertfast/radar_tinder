import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import MapView from 'react-native-maps';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRadarStore } from '../store/radarStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { formatDistance } from '../utils/format';
import { hasProAccess } from '../utils/access';
import { RadarAlert } from '../types';
import { RadarRendererMode } from '../components/RadarAnimation';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { RadarHomeDashboard } from './radar/components/RadarHomeDashboard';
import { PRO_FEATURES } from './radar/constants';
import { useVoiceMode } from './radar/hooks/useVoiceMode';
import { useRadarSignalLevels } from './radar/hooks/useRadarSignalLevels';
import { useRadarDataSync } from './radar/hooks/useRadarDataSync';
import { radarScreenStyles as styles } from './radar/styles/radarScreenStyles';
import { AdService } from '../services/AdService';

const RadarScreen = ({ navigation }: any) => {
  const { user, normalizeAccessState } = useAuthStore();
  const canUsePro = hasProAccess(user);
  const {
    hasHydrated,
    unitSystem,
    voiceWarningsEnabled,
    hapticAlertsEnabled,
    warningVolume,
    setVoiceWarningsEnabled,
    setWarningVolume,
  } = useSettingsStore();
  const setRadarLocations = useRadarStore((state) => state.setRadarLocations);
  const activeAlerts = useRadarStore((state) => state.activeAlerts);

  const mapRef = useRef<MapView | null>(null);
  const proSliderRef = useRef<FlatList>(null);
  const isStartingDriveRef = useRef(false);
  const hasCenteredMapRef = useRef(false);
  const isTypingRef = useRef(false);
  const manualPanModeRef = useRef(false);
  const currentLocationRef = useRef<any>(null);

  const { width, height } = useWindowDimensions();
  const isScreenFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [proSliderIndex, setProSliderIndex] = useState(0);

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

  const dataSync = useRadarDataSync({
    currentLocation,
    setCurrentLocation,
    currentLocationRef,
    mapRef,
    allowUiLocationUpdates: isScreenFocused,
    isDriving: false,
    activeTab: 'Basic',
    followHeading: false,
    isTypingRef,
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

  const { signalLevel: radarSignalLevel, dangerLevel: radarDangerLevel } = useRadarSignalLevels(
    dataSync.nearbyRadars,
    dataSync.closestRadar
  );
  const radarRendererMode = useMemo<RadarRendererMode>(() => {
    const configured = (process.env.EXPO_PUBLIC_RADAR_RENDERER || 'legacy2d').trim().toLowerCase();
    if (configured === 'life3d' || configured === 'legacy2d' || configured === 'auto') {
      return configured;
    }
    return 'legacy2d';
  }, []);

  const bottomSafe = Math.max(insets.bottom, 10);
  const tabBarInset = TAB_BAR_HEIGHT + bottomSafe + 16;
  const availableHomeHeight = Math.max(520, height - insets.top - tabBarInset);
  const isCompactHomeHeight = availableHomeHeight < 720;
  const radarAnimationSize = Math.max(
    isCompactHomeHeight ? 200 : 220,
    Math.min(
      Math.round(width * (isCompactHomeHeight ? 0.62 : 0.70)),
      Math.round(availableHomeHeight * (isCompactHomeHeight ? 0.38 : 0.42)),
      isCompactHomeHeight ? 280 : 340
    )
  );
  const nearestRadarSummary = dataSync.closestRadar
    ? dataSync.closestRadarHint
      ? `${formatDistance(dataSync.closestRadar.distance, unitSystem)} at ${dataSync.closestRadarHint}`
      : formatDistance(dataSync.closestRadar.distance, unitSystem)
    : 'Scanning...';

  useEffect(() => {
    if (!isScreenFocused) return;
    normalizeAccessState().catch(() => {});
    AdService.preloadAll().catch(() => {});
  }, [isScreenFocused, normalizeAccessState]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (proSliderIndex + 1) % PRO_FEATURES.length;
      setProSliderIndex(next);
      proSliderRef.current?.scrollToIndex({ index: next, animated: true, viewPosition: 0.5 });
    }, 4000);
    return () => clearInterval(interval);
  }, [proSliderIndex]);

  const openDriveMode = useCallback(
    (mode: 'Basic' | 'Map' | 'Graphic') => {
      navigation.getParent?.('main-tabs')?.navigate('Drive', { initialMode: mode });
    },
    [navigation]
  );

  const handleStartDriving = useCallback(async () => {
    if (isStartingDriveRef.current) {
      return;
    }

    isStartingDriveRef.current = true;
    try {
      await AdService.showInterstitial('start_driving_basic').catch(() => 'failed');
      openDriveMode('Map');
    } finally {
      isStartingDriveRef.current = false;
    }
  }, [openDriveMode]);

  return (
    <RadarHomeDashboard
      styles={styles}
      insetsTop={insets.top}
      tabBarInset={tabBarInset}
      width={width}
      height={height}
      proSliderRef={proSliderRef}
      proSliderIndex={proSliderIndex}
      proFeatures={PRO_FEATURES}
      radarAuraSize={Math.round(radarAnimationSize * 0.78)}
      radarAnimationSize={radarAnimationSize}
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
      onToggleDrivingMode={handleStartDriving}
      onOpenDriveBasic={() => openDriveMode('Basic')}
      onOpenAlerts={() => navigation.navigate('Alerts')}
      onToggleVoiceWarnings={toggleVoiceWarnings}
      pauseRadarAnimation={false}
    />
  );
};

export default RadarScreen;
