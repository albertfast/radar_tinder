import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SupabaseService } from '../services/SupabaseService';
import {
  MapFlowNavigationScreen,
  useNavigationStore,
  useLocation,
  useSpeedLimits,
  useNavigationTracking,
  type MapOverlayMarker,
} from '../mapflow-navigation-kit';
import { useAuthStore } from '../store/authStore';
import { useRadarStore } from '../store/radarStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { RadarService } from '../services/RadarService';
import { LocationService } from '../services/LocationService';
import { AdService } from '../services/AdService';
import { hasProAccess } from '../utils/access';
import { RadarGraphicView } from './components/RadarGraphicView';
import { RadarBasicTab } from './radar/components/driving/RadarBasicTab';

const RADAR_REFRESH_MS = 15000;
const DRIVE_MODES = ['Basic', 'Map', 'Graphic'] as const;

type DriveMode = (typeof DRIVE_MODES)[number];

const toRouteCoordinates = (geometry: [number, number][] | null | undefined) =>
  Array.isArray(geometry)
    ? geometry
        .map((point) => {
          const longitude = Number(point?.[0]);
          const latitude = Number(point?.[1]);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }
          return { latitude, longitude };
        })
        .filter((point): point is { latitude: number; longitude: number } => point !== null)
    : [];

const resolveDriveMode = (value?: string | null): DriveMode =>
  DRIVE_MODES.includes(value as DriveMode) ? (value as DriveMode) : 'Map';

const calculateDisplaySpeed = (speedMetersPerSecond: number, unitSystem: 'imperial' | 'metric') =>
  Math.max(0, speedMetersPerSecond * (unitSystem === 'imperial' ? 2.23694 : 3.6));

const isVisibleSpeedCamera = (radar: any) => {
  const type = String(radar?.type || '').toLowerCase();
  const markerKind = String(radar?.markerKind || '').toLowerCase();
  return type === 'speed_camera' || type === 'fixed' || markerKind === 'camera';
};

const isVisibleRedLightCamera = (radar: any) => {
  const type = String(radar?.type || '').toLowerCase();
  const markerKind = String(radar?.markerKind || '').toLowerCase();
  return type === 'red_light' || markerKind === 'red_light';
};

const getRadarDistanceKm = (radar: any) => {
  const distance = Number(radar?.distance);
  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
};

const DriveScreen = ({ navigation, route }: any) => {
  // Unified, persistent background synchronization for Driving tabs
  useLocation();
  useSpeedLimits();
  useNavigationTracking();

  const { user } = useAuthStore();
  const canUsePro = hasProAccess(user);
  const userLocation = useNavigationStore((state) => state.userLocation);
  const userHeading = useNavigationStore((state) => state.userHeading);
  const userSpeed = useNavigationStore((state) => state.userSpeed);
  const routeState = useNavigationStore((state) => state.route);
  const destinationName = useNavigationStore((state) => state.destinationName);
  const isNavigating = useNavigationStore((state) => state.isNavigating);
  const navCountryCode = useNavigationStore((state) => state.countryCode);
  const setNavUnitSystem = useNavigationStore((state) => state.setUnitSystem);
  const setRouteGuidanceActive = useRadarStore((state) => state.setRouteGuidanceActive);
  const setRouteGuidancePath = useRadarStore((state) => state.setRouteGuidancePath);
  const keepAwakeWhileDriving = useSettingsStore((state) => state.keepAwakeWhileDriving);
  const unitSystem = useSettingsStore((state) => state.unitSystem);
  const hideTabBar = useUiStore((state) => state.hideTabBar);
  const showTabBar = useUiStore((state) => state.showTabBar);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [activeMode, setActiveMode] = useState<DriveMode>(() => {
    const requestedMode = resolveDriveMode(route?.params?.initialMode);
    return requestedMode === 'Graphic' && !canUsePro ? 'Map' : requestedMode;
  });
  const [overlayMarkers, setOverlayMarkers] = useState<MapOverlayMarker[]>([]);
  const [nearbyRadars, setNearbyRadars] = useState<any[]>([]);
  const [driveStartTime, setDriveStartTime] = useState<Date | null>(null);
  const [tripDistanceKm, setTripDistanceKm] = useState(0);
  const [speedSamples, setSpeedSamples] = useState<Array<{ speedKph: number; at: number }>>([]);

  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const tripStartLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const tripEndLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastSpeedSampleAtRef = useRef(0);
  const persistedTripRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const tripSnapshotRef = useRef({
    driveStartTime: null as Date | null,
    tripDistanceKm: 0,
    destinationName: '' as string | null,
    avgSpeedKph: 0,
    topSpeedKph: 0,
    movingDuration: 0,
    sampleCount: 0,
    startLatitude: null as number | null,
    startLongitude: null as number | null,
    endLatitude: null as number | null,
    endLongitude: null as number | null,
  });
  const routeCoordinates = useMemo(() => toRouteCoordinates(routeState?.geometry), [routeState?.geometry]);
  const hasRoutePreview = routeCoordinates.length > 1;
  const hasActiveRoute = isNavigating && hasRoutePreview;
  const chromeTopOffset = insets.top + 108;
  const currentSpeedDisplay = useMemo(
    () => calculateDisplaySpeed(userSpeed, unitSystem),
    [unitSystem, userSpeed]
  );
  const currentSpeedKph = useMemo(() => Math.max(0, userSpeed * 3.6), [userSpeed]);
  const renderMode = activeMode === 'Graphic' && !canUsePro ? 'Map' : activeMode;

  const tripTelemetry = useMemo(() => {
    const sampleCount = speedSamples.length;
    const avgSpeedKph = sampleCount
      ? Math.round(speedSamples.reduce((sum, sample) => sum + sample.speedKph, 0) / sampleCount)
      : 0;
    const topSpeedKph = sampleCount ? Math.max(...speedSamples.map((sample) => sample.speedKph)) : 0;
    const movingDuration = speedSamples.filter((sample) => sample.speedKph >= 5).length * 5;
    return {
      sampleCount,
      avgSpeedKph,
      topSpeedKph,
      movingDuration,
    };
  }, [speedSamples]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    tripSnapshotRef.current = {
      driveStartTime,
      tripDistanceKm,
      destinationName: destinationName || null,
      avgSpeedKph: tripTelemetry.avgSpeedKph,
      topSpeedKph: tripTelemetry.topSpeedKph,
      movingDuration: tripTelemetry.movingDuration,
      sampleCount: tripTelemetry.sampleCount,
      startLatitude: tripStartLocationRef.current?.lat ?? null,
      startLongitude: tripStartLocationRef.current?.lng ?? null,
      endLatitude: tripEndLocationRef.current?.lat ?? null,
      endLongitude: tripEndLocationRef.current?.lng ?? null,
    };
  }, [destinationName, driveStartTime, tripDistanceKm, tripTelemetry]);

  const persistTripSnapshot = useCallback(async () => {
    const userId = userIdRef.current;
    const snapshot = tripSnapshotRef.current;
    if (persistedTripRef.current || !userId || !snapshot.driveStartTime) {
      return;
    }
    const durationSeconds = Math.max(1, Math.round((Date.now() - snapshot.driveStartTime.getTime()) / 1000));
    const distanceMeters = Math.max(0, Math.round(snapshot.tripDistanceKm * 1000));
    if (distanceMeters < 50 && snapshot.sampleCount < 3) {
      return;
    }

    persistedTripRef.current = true;
    await SupabaseService.createTrip({
      userId,
      startLocation: 'Current location',
      endLocation: snapshot.destinationName || 'Route destination',
      distance: distanceMeters,
      duration: durationSeconds,
      score: Math.min(100, Math.max(0, Math.round(78 + Math.min(20, snapshot.sampleCount * 2)))),
      startTime: snapshot.driveStartTime.toISOString(),
      endTime: new Date().toISOString(),
      avgSpeedKph: snapshot.avgSpeedKph,
      topSpeedKph: snapshot.topSpeedKph,
      movingDuration: snapshot.movingDuration,
      speedSamplesCount: snapshot.sampleCount,
      startLatitude: snapshot.startLatitude,
      startLongitude: snapshot.startLongitude,
      endLatitude: snapshot.endLatitude,
      endLongitude: snapshot.endLongitude,
    }).catch((error) => {
      console.warn('Failed to persist trip snapshot:', error);
    });
  }, []);

  const resetTripSession = useCallback(() => {
    persistedTripRef.current = false;
    tripStartLocationRef.current = null;
    tripEndLocationRef.current = null;
    setDriveStartTime(new Date());
    setTripDistanceKm(0);
    setSpeedSamples([]);
    lastSpeedSampleAtRef.current = 0;
    lastLocationRef.current = null;
  }, []);

  const handleOpenSubscription = useCallback(() => {
    navigation.navigate('Home', { screen: 'Subscription' });
  }, [navigation]);

  useEffect(() => {
    setNavUnitSystem(unitSystem, navCountryCode);
  }, [navCountryCode, setNavUnitSystem, unitSystem]);

  useEffect(() => {
    const requestedMode = resolveDriveMode(route?.params?.initialMode);
    if (route?.params?.initialMode) {
      navigation.setParams?.({ initialMode: undefined });
      if (requestedMode === 'Graphic' && !canUsePro) {
        setActiveMode('Map');
        handleOpenSubscription();
        return;
      }
      setActiveMode(requestedMode);
    }
  }, [canUsePro, handleOpenSubscription, navigation, route?.params?.initialMode]);

  useEffect(() => {
    if (activeMode === 'Graphic' && !canUsePro) {
      setActiveMode('Map');
      handleOpenSubscription();
    }
  }, [activeMode, canUsePro, handleOpenSubscription]);

  useFocusEffect(
    useCallback(() => {
      hideTabBar('drive_screen');
      resetTripSession();
      return () => {
        void persistTripSnapshot();
        showTabBar('drive_screen');
      };
    }, [hideTabBar, persistTripSnapshot, resetTripSession, showTabBar])
  );

  useEffect(() => {
    AdService.markDrivingState(isFocused && Boolean(driveStartTime), isFocused && hasActiveRoute);
    return () => {
      AdService.markDrivingState(false, false);
    };
  }, [driveStartTime, hasActiveRoute, isFocused]);

  useEffect(() => {
    if (isFocused && keepAwakeWhileDriving) {
      activateKeepAwakeAsync().catch(() => {});
      return () => {
        deactivateKeepAwake();
      };
    }

    deactivateKeepAwake();
    return () => {
      deactivateKeepAwake();
    };
  }, [isFocused, keepAwakeWhileDriving]);

  useEffect(() => {
    setRouteGuidanceActive(hasActiveRoute);
    setRouteGuidancePath(hasActiveRoute ? routeCoordinates : []);
  }, [hasActiveRoute, routeCoordinates, setRouteGuidanceActive, setRouteGuidancePath]);

  useEffect(
    () => () => {
      setRouteGuidanceActive(false);
      setRouteGuidancePath([]);
    },
    [setRouteGuidanceActive, setRouteGuidancePath]
  );

  useEffect(() => {
    if (!userLocation || !isFocused) return;

    if (!driveStartTime) {
      setDriveStartTime(new Date());
    }

    if (!tripStartLocationRef.current) {
      tripStartLocationRef.current = {
        lat: userLocation.lat,
        lng: userLocation.lng,
      };
    }

    tripEndLocationRef.current = {
      lat: userLocation.lat,
      lng: userLocation.lng,
    };

    const previous = lastLocationRef.current;
    if (previous) {
      const movedKm = LocationService.calculateDistanceSync(
        previous.lat,
        previous.lng,
        userLocation.lat,
        userLocation.lng
      );
      if (movedKm > 0.003) {
        setTripDistanceKm((current) => current + movedKm);
      }
    }

    lastLocationRef.current = {
      lat: userLocation.lat,
      lng: userLocation.lng,
    };
  }, [driveStartTime, isFocused, userLocation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState !== 'active') {
        void persistTripSnapshot();
        return;
      }
      if (isFocused && previousState !== 'active') {
        resetTripSession();
      }
    });

    return () => subscription.remove();
  }, [isFocused, persistTripSnapshot, resetTripSession]);

  useEffect(() => {
    if (!isFocused || !driveStartTime) return;
    const now = Date.now();
    if (now - lastSpeedSampleAtRef.current < 5000) return;
    lastSpeedSampleAtRef.current = now;
    setSpeedSamples((prev) => [
      ...prev.slice(-23),
      {
        speedKph: currentSpeedKph,
        at: now,
      },
    ]);
  }, [currentSpeedKph, driveStartTime, isFocused]);

  const refreshOverlayMarkers = useCallback(async () => {
    if (!userLocation) {
      setOverlayMarkers([]);
      setNearbyRadars([]);
      return;
    }

    const nearby = await RadarService.getNearbyRadars(
      userLocation.lat,
      userLocation.lng,
      canUsePro ? 10 : 5
    );
    const filtered =
      hasRoutePreview && routeCoordinates.length > 1
        ? RadarService.filterRouteRelevantRadars(nearby, {
            currentLocation: {
              latitude: userLocation.lat,
              longitude: userLocation.lng,
              heading: Number.isFinite(userHeading) ? userHeading : null,
            },
            routeCoords: routeCoordinates,
            speedKph: Math.max(10, userSpeed * 3.6),
            maxCorridorMeters: 180,
            maxHeadingDeltaDeg: 75,
            etaSecondsWindow: [0, 3600],
            requireEtaWindow: false,
          })
        : nearby;

    const visibleSpeedCameras = filtered.filter(isVisibleSpeedCamera);
    const visibleRedLightCameras = filtered
      .filter(isVisibleRedLightCamera)
      .filter((radar) => getRadarDistanceKm(radar) <= (hasRoutePreview ? 4 : 2))
      .slice(0, hasRoutePreview ? 12 : 6);
    const visibleMapRadars = [...visibleSpeedCameras.slice(0, 64), ...visibleRedLightCameras];

    setNearbyRadars(visibleSpeedCameras);
    setOverlayMarkers(
      visibleMapRadars.map((radar) => ({
        id: radar.id,
        latitude: radar.latitude,
        longitude: radar.longitude,
        type: radar.type,
        markerKind: radar.markerKind,
        speedLimit: radar.speedLimit,
      }))
    );
  }, [canUsePro, hasRoutePreview, routeCoordinates, userHeading, userLocation, userSpeed]);

  useEffect(() => {
    if (!isFocused) return undefined;

    refreshOverlayMarkers().catch(() => {});
    const intervalId = setInterval(() => {
      refreshOverlayMarkers().catch(() => {});
    }, RADAR_REFRESH_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [isFocused, refreshOverlayMarkers]);

  const handleNavigateHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Home', { screen: 'RadarSettings' });
  }, [navigation]);

  const handleSelectMode = useCallback(
    (mode: DriveMode) => {
      if (mode === 'Graphic' && !canUsePro) {
        handleOpenSubscription();
        return;
      }
      setActiveMode(mode);
    },
    [canUsePro, handleOpenSubscription]
  );

  return (
    <View style={styles.container}>
      {/* Map Tab Container */}
      <View style={[styles.tabContent, renderMode !== 'Map' && styles.hiddenContent]}>
        <MapFlowNavigationScreen
          overlayMarkers={overlayMarkers}
          topOverlayOffset={chromeTopOffset}
        />
      </View>

      {/* Basic Tab Container */}
      <View style={[styles.tabContent, renderMode !== 'Basic' && styles.hiddenContent]}>
        <RadarBasicTab
          nearbyRadars={nearbyRadars}
          topContentInset={chromeTopOffset}
          bottomContentInset={Math.max(insets.bottom, 16)}
          unitSystem={unitSystem}
        />
      </View>

      {/* Graphic Tab Container */}
      {canUsePro ? (
        <View style={[styles.tabContent, renderMode !== 'Graphic' && styles.hiddenContent]}>
          <RadarGraphicView
            totalDistance={tripDistanceKm}
            drivingStartTime={driveStartTime}
            currentSpeed={currentSpeedDisplay}
            unitSystem={unitSystem}
            topOverlayInset={chromeTopOffset}
            onUpgrade={handleOpenSubscription}
          />
        </View>
      ) : (
        renderMode === 'Graphic' && (
          <LinearGradient colors={['#020617', '#020617']} style={StyleSheet.absoluteFill} />
        )
      )}

      {/* Floating Header and Switcher Tabs with permanent high zIndex */}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleNavigateHome} style={styles.headerButton}>
            <MaterialCommunityIcons name="home-variant" size={22} color="#F8FAFC" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>DRIVING MODE</Text>
          </View>

          <TouchableOpacity onPress={handleOpenSettings} style={styles.headerButton}>
            <MaterialCommunityIcons name="cog" size={22} color="#F8FAFC" />
          </TouchableOpacity>
        </View>

        <View style={styles.tabBarWrap} pointerEvents="box-none">
          <View style={styles.tabBar}>
            {DRIVE_MODES.map((mode) => (
              <Pressable
                key={mode}
                onPress={() => handleSelectMode(mode)}
                style={[styles.tabItem, renderMode === mode && styles.tabItemActive]}
              >
                <Text style={[styles.tabText, renderMode === mode && styles.tabTextActive]}>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

export default DriveScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontWeight: '900',
    fontSize: 16,
  },
  tabBarWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#000000',
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,17,0.96)',
    borderRadius: 12,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    backgroundColor: '#222',
  },
  tabText: {
    color: '#888',
    fontWeight: '800',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#FF5252',
  },
  graphicWrap: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  hiddenContent: {
    display: 'none',
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
});
