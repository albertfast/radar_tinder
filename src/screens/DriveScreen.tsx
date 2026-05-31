import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MapFlowNavigationScreen,
  useNavigationStore,
  type MapOverlayMarker,
  type MapViewport,
} from '../mapflow-navigation-kit';
import { useAuthStore } from '../store/authStore';
import { useRadarStore } from '../store/radarStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { RadarService } from '../services/RadarService';
import { LocationService } from '../services/LocationService';
import { AdService } from '../services/AdService';
import { SupabaseService } from '../services/SupabaseService';
import { hasProAccess } from '../utils/access';
import { visualTokens } from '../constants/visualTokens';
import { RadarGraphicView } from './components/RadarGraphicView';
import { RadarBasicTab } from './radar/components/driving/RadarBasicTab';

const RADAR_REFRESH_BROWSE_MS = 15000;
const RADAR_REFRESH_NAV_MS = 8000;
const VIEWPORT_DEBOUNCE_MS = 500;
const OFF_ROUTE_REFRESH_COOLDOWN_MS = 2500;
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

const DriveScreen = ({ navigation, route }: any) => {
  const { user } = useAuthStore();
  const canUsePro = hasProAccess(user);
  const userLocation = useNavigationStore((state) => state.userLocation);
  const userHeading = useNavigationStore((state) => state.userHeading);
  const userSpeed = useNavigationStore((state) => state.userSpeed);
  const routeState = useNavigationStore((state) => state.route);
  const isNavigating = useNavigationStore((state) => state.isNavigating);
  const isOffRoute = useNavigationStore((state) => state.isOffRoute);
  const navCountryCode = useNavigationStore((state) => state.countryCode);
  const setNavUnitSystem = useNavigationStore((state) => state.setUnitSystem);
  const setRouteGuidanceActive = useRadarStore((state) => state.setRouteGuidanceActive);
  const setRouteGuidancePath = useRadarStore((state) => state.setRouteGuidancePath);
  const keepAwakeWhileDriving = useSettingsStore((state) => state.keepAwakeWhileDriving);
  const unitSystem = useSettingsStore((state) => state.unitSystem);
  const hideTabBar = useUiStore((state) => state.hideTabBar);
  const showTabBar = useUiStore((state) => state.showTabBar);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const isFocused = useIsFocused();
  const [activeMode, setActiveMode] = useState<DriveMode>(
    resolveDriveMode(route?.params?.initialMode)
  );
  const [overlayMarkers, setOverlayMarkers] = useState<MapOverlayMarker[]>([]);
  const [nearbyRadars, setNearbyRadars] = useState<any[]>([]);
  const [driveStartTime, setDriveStartTime] = useState<Date | null>(null);
  const [tripDistanceKm, setTripDistanceKm] = useState(0);

  const tripStartLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const tripDistanceKmRef = useRef(0);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const viewportRef = useRef<MapViewport | null>(null);
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOffRouteRefreshRef = useRef(0);
  const routeCoordinates = useMemo(() => toRouteCoordinates(routeState?.geometry), [routeState?.geometry]);
  const hasRoutePreview = routeCoordinates.length > 1;
  const hasActiveRoute = isNavigating && hasRoutePreview;
  const chromeTopOffset = insets.top + (height < 700 ? 88 : 108);
  const currentSpeedDisplay = useMemo(
    () => calculateDisplaySpeed(userSpeed, unitSystem),
    [unitSystem, userSpeed]
  );

  useEffect(() => {
    setNavUnitSystem(unitSystem, navCountryCode);
  }, [navCountryCode, setNavUnitSystem, unitSystem]);

  useEffect(() => {
    const requestedMode = resolveDriveMode(route?.params?.initialMode);
    if (route?.params?.initialMode) {
      setActiveMode(requestedMode);
      navigation.setParams?.({ initialMode: undefined });
    }
  }, [navigation, route?.params?.initialMode]);

  useFocusEffect(
    useCallback(() => {
      hideTabBar('drive_screen');
      const startedAt = new Date();
      setDriveStartTime(startedAt);
      setTripDistanceKm(0);
      tripDistanceKmRef.current = 0;
      lastLocationRef.current = null;
      tripStartLocationRef.current = userLocation
        ? { lat: userLocation.lat, lng: userLocation.lng }
        : null;
      AdService.markDrivingState(true, hasActiveRoute);

      return () => {
        const endedAt = new Date();
        const durationSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
        const distanceMeters = Math.round(tripDistanceKmRef.current * 1000);
        const endCoords = lastLocationRef.current ?? tripStartLocationRef.current;

        if (
          user?.id &&
          distanceMeters >= 100 &&
          durationSec >= 30
        ) {
          SupabaseService.createTrip({
            userId: user.id,
            distance: distanceMeters,
            duration: durationSec,
            startTime: startedAt.toISOString(),
            endTime: endedAt.toISOString(),
            startLatitude: tripStartLocationRef.current?.lat ?? null,
            startLongitude: tripStartLocationRef.current?.lng ?? null,
            endLatitude: endCoords?.lat ?? null,
            endLongitude: endCoords?.lng ?? null,
            avgSpeedKph:
              durationSec > 0 ? Math.round((distanceMeters / durationSec) * 3.6) : null,
          }).catch(() => {});
        }

        AdService.markDrivingState(false, false);
        showTabBar('drive_screen');
      };
    }, [hasActiveRoute, hideTabBar, showTabBar, user?.id, userLocation])
  );

  useEffect(() => {
    if (isFocused) {
      AdService.markDrivingState(true, hasActiveRoute);
    }
  }, [hasActiveRoute, isFocused]);

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

    const previous = lastLocationRef.current;
    if (previous) {
      const movedKm = LocationService.calculateDistanceSync(
        previous.lat,
        previous.lng,
        userLocation.lat,
        userLocation.lng
      );
      if (movedKm > 0.003) {
        setTripDistanceKm((current) => {
          const next = current + movedKm;
          tripDistanceKmRef.current = next;
          return next;
        });
      }
    }

    lastLocationRef.current = {
      lat: userLocation.lat,
      lng: userLocation.lng,
    };
  }, [driveStartTime, isFocused, userLocation]);

  const refreshOverlayMarkers = useCallback(async () => {
    try {
      let filtered: any[] = [];

      if (hasRoutePreview && routeCoordinates.length > 1 && userLocation) {
        filtered = await RadarService.getRouteAwareRadars({
          routeCoords: routeCoordinates,
          currentLocation: {
            latitude: userLocation.lat,
            longitude: userLocation.lng,
            heading: Number.isFinite(userHeading) ? userHeading : null,
          },
          speedKph: Math.max(10, userSpeed * 3.6),
          allowedTypes: ['speed_camera'],
          maxCorridorMeters: 55,
          maxHeadingDeltaDeg: 35,
          minAheadMeters: 0,
        });
      } else {
        const viewport = viewportRef.current;
        if (viewport) {
          filtered = await RadarService.getSpeedCamerasInViewport({
            center: { latitude: viewport.center.lat, longitude: viewport.center.lng },
            bounds: {
              north: viewport.bounds.north,
              south: viewport.bounds.south,
              east: viewport.bounds.east,
              west: viewport.bounds.west,
            },
          });
        } else if (userLocation) {
          const nearby = await RadarService.getNearbyRadars(
            userLocation.lat,
            userLocation.lng,
            canUsePro ? 10 : 5
          );
          filtered = nearby.filter((radar) => radar.type === 'speed_camera');
        }
      }

      setNearbyRadars(filtered);
      setOverlayMarkers(
        filtered.slice(0, 48).map((radar) => ({
          id: radar.id,
          latitude: radar.latitude,
          longitude: radar.longitude,
          type: radar.type,
          markerKind: 'camera' as const,
          speedLimit: radar.speedLimit,
        }))
      );
    } catch {
      setNearbyRadars([]);
      setOverlayMarkers([]);
    }
  }, [canUsePro, hasRoutePreview, routeCoordinates, userHeading, userLocation, userSpeed]);

  const handleViewportChange = useCallback(
    (viewport: MapViewport) => {
      viewportRef.current = viewport;
      if (hasRoutePreview) return;

      if (viewportDebounceRef.current) {
        clearTimeout(viewportDebounceRef.current);
      }
      viewportDebounceRef.current = setTimeout(() => {
        refreshOverlayMarkers().catch(() => {});
      }, VIEWPORT_DEBOUNCE_MS);
    },
    [hasRoutePreview, refreshOverlayMarkers]
  );

  useEffect(() => {
    if (!isFocused) return undefined;

    refreshOverlayMarkers().catch(() => {});
    const intervalMs = hasActiveRoute ? RADAR_REFRESH_NAV_MS : RADAR_REFRESH_BROWSE_MS;
    const intervalId = setInterval(() => {
      refreshOverlayMarkers().catch(() => {});
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
      if (viewportDebounceRef.current) {
        clearTimeout(viewportDebounceRef.current);
      }
    };
  }, [hasActiveRoute, isFocused, refreshOverlayMarkers]);

  useEffect(() => {
    if (!isFocused || !isOffRoute || !hasRoutePreview) return;
    const now = Date.now();
    if (now - lastOffRouteRefreshRef.current < OFF_ROUTE_REFRESH_COOLDOWN_MS) return;
    lastOffRouteRefreshRef.current = now;
    refreshOverlayMarkers().catch(() => {});
  }, [hasRoutePreview, isFocused, isOffRoute, refreshOverlayMarkers]);

  useEffect(() => {
    refreshOverlayMarkers().catch(() => {});
  }, [hasRoutePreview, routeCoordinates.length, refreshOverlayMarkers]);

  const handleNavigateHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Home', { screen: 'RadarSettings' });
  }, [navigation]);

  const handleSelectMode = useCallback((mode: DriveMode) => {
    setActiveMode(mode);
  }, []);

  return (
    <View style={styles.container}>
      {activeMode === 'Graphic' ? (
        <LinearGradient colors={['#020617', '#020617']} style={StyleSheet.absoluteFill} />
      ) : activeMode === 'Basic' ? (
        <RadarBasicTab
          nearbyRadars={nearbyRadars}
          topContentInset={chromeTopOffset}
          bottomContentInset={Math.max(insets.bottom, 16)}
          unitSystem={unitSystem}
        />
      ) : (
        <MapFlowNavigationScreen
          overlayMarkers={overlayMarkers}
          topOverlayOffset={chromeTopOffset}
          onViewportChange={handleViewportChange}
        />
      )}

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleNavigateHome} style={styles.headerButton}>
            <MaterialCommunityIcons name="home-variant" size={22} color="#F8FAFC" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>DRIVING MODE</Text>
            <Text style={styles.headerSubtitle}>{activeMode.toUpperCase()}</Text>
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
                style={[styles.tabItem, activeMode === mode && styles.tabItemActive]}
              >
                <Text style={[styles.tabText, activeMode === mode && styles.tabTextActive]}>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {activeMode === 'Graphic' ? (
          <View style={styles.graphicWrap}>
            <RadarGraphicView
              totalDistance={tripDistanceKm}
              drivingStartTime={driveStartTime}
              currentSpeed={currentSpeedDisplay}
              unitSystem={unitSystem}
              topOverlayInset={chromeTopOffset + 8}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default DriveScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: visualTokens.bg,
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: visualTokens.headerShadow,
    borderBottomWidth: 1,
    borderBottomColor: visualTokens.surfaceGlassBorder,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: visualTokens.surfaceGlass,
    borderWidth: 1,
    borderColor: visualTokens.surfaceGlassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: visualTokens.textPrimary,
    fontWeight: '900',
    fontSize: 16,
  },
  headerSubtitle: {
    color: visualTokens.accentTurquoise,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tabBarWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: visualTokens.surfaceGlass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: visualTokens.surfaceGlassBorder,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  tabItem: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: visualTokens.tabActive,
  },
  tabText: {
    color: visualTokens.tabInactive,
    fontWeight: '700',
    fontSize: 12,
  },
  tabTextActive: {
    color: visualTokens.tabActive,
  },
  graphicWrap: {
    flex: 1,
  },
});
